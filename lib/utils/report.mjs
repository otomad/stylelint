import { hasIndices, hasRange, isFunction as isFn, isString } from '../utils/validateTypes.mjs';

import {
	DEFAULT_SEVERITY,
	RULE_NAME_ALL,
	SEVERITY_ERROR,
	SEVERITY_WARNING,
} from '../constants.mjs';

/** @import { DisabledRangeObject, Problem, Range, RuleMessage, StylelintPostcssResult, Utils, WarningOptions } from 'stylelint' */

/**
 * Report a problem.
 *
 * This function accounts for `disabledRanges` attached to the result.
 * That is, if the reported problem is within a disabledRange,
 * it is ignored. Otherwise, it is attached to the result as a
 * postcss warning.
 *
 * It also accounts for the rule's severity.
 *
 * You *must* pass *either* a node or a line number.
 *
 * @type {Utils['report']}
 */
export default function report(problem) {
	const { node, result, ruleName, fix, ...rest } = problem;
	const range = problemRange(problem);
	const {
		disabledRanges,
		quiet,
		ruleSeverities,
		config: { defaultSeverity, ignoreDisables } = {},
		customMessages: { [ruleName]: message = rest.message },
		customUrls: { [ruleName]: customUrl },
		ruleMetadata: { [ruleName]: metadata },
	} = result.stylelint;
	const { messageArgs = [], severity = ruleSeverities[ruleName] } = rest;
	const ruleSeverity =
		(isFn(severity) ? severity(...messageArgs) : severity) ?? defaultSeverity ?? DEFAULT_SEVERITY;

	// In quiet mode, mere warnings are ignored
	if (quiet && ruleSeverity === SEVERITY_WARNING) return;

	if (isFn(fix) && metadata && !metadata.fixable) {
		throw new Error(
			`The "${ruleName}" rule requires "meta.fixable" to be truthy if the "fix" callback is being passed`,
		);
	}

	if (isFixApplied(problem, range.start.line)) return;

	if (isDisabled(ruleName, range.start.line, disabledRanges)) {
		// Collect disabled warnings
		// Used to report `needlessDisables` in subsequent processing.
		const disabledWarnings = (result.stylelint.disabledWarnings ||= []);

		disabledWarnings.push({
			rule: ruleName,
			line: range.start.line,
		});

		if (!ignoreDisables) return;
	}

	if (!result.stylelint.stylelintError && ruleSeverity === SEVERITY_ERROR) {
		result.stylelint.stylelintError = true;
	}

	if (!result.stylelint.stylelintWarning && ruleSeverity === SEVERITY_WARNING) {
		result.stylelint.stylelintWarning = true;
	}

	/** @type {WarningOptions} */
	const warningProperties = {
		severity: ruleSeverity,
		rule: ruleName,
	};

	if (node) {
		warningProperties.node = node;
	}

	warningProperties.start = range.start;
	warningProperties.end = range.end;

	if (customUrl) {
		warningProperties.url = customUrl;
	}

	const warningMessage = buildWarningMessage(message, messageArgs);

	result.warn(warningMessage, warningProperties);
}

/**
 * @param {Problem} problem
 * @returns {Range}
 */
function problemRange(problem) {
	if (!problem.node) {
		throw new Error(
			`The "${problem.ruleName}" rule failed to pass correct position arguments to the \`report()\` function. Pass a PostCSS \`node\` to each report.`,
		);
	}

	// `start/end` based range
	if (hasRange(problem)) {
		return {
			start: problem.start,
			end: problem.end,
		};
	}

	if ('start' in problem || 'end' in problem) {
		throw new Error(
			`The "${problem.ruleName}" rule failed to pass correct position arguments to the \`report()\` function. Both \`start\` and \`end\` are required and must be valid positions.`,
		);
	}

	// `index/endIndex` based range
	if (hasIndices(problem)) {
		return problem.node.rangeBy({ index: problem.index, endIndex: problem.endIndex });
	}

	if ('index' in problem || 'endIndex' in problem) {
		throw new Error(
			`The "${problem.ruleName}" rule failed to pass correct position arguments to the \`report()\` function. Both \`index\` and \`endIndex\` are required and must be numbers.`,
		);
	}

	// `word` based range
	if ('word' in problem && isString(problem.word)) {
		return problem.node.rangeBy({ word: problem.word });
	}

	return problem.node.rangeBy({});
}

/**
 * @param {RuleMessage} message
 * @param {NonNullable<Problem['messageArgs']>} messageArgs
 * @returns {string}
 */
function buildWarningMessage(message, messageArgs) {
	if (isString(message)) {
		return printfLike(message, ...messageArgs);
	}

	return message(...messageArgs);
}

/**
 * @param {string} format
 * @param {Array<unknown>} args
 * @returns {string}
 */
function printfLike(format, ...args) {
	return args.reduce((/** @type {string} */ result, arg) => {
		return result.replace(/%[ds]/, String(arg));
	}, format);
}

/**
 * Check whether a rule is disabled for a given line
 * @param {string} ruleName
 * @param {number} startLine
 * @param {DisabledRangeObject} disabledRanges
 */
function isDisabled(ruleName, startLine, disabledRanges) {
	const ranges = disabledRanges[ruleName] ?? disabledRanges[RULE_NAME_ALL] ?? [];

	for (const range of ranges) {
		if (
			// If the problem is within a disabledRange,
			// and that disabledRange's rules include this one
			range.start <= startLine &&
			(range.end === undefined || range.end >= startLine) &&
			/** @todo populate rules in assignDisabledRanges util */
			(!range.rules || range.rules.includes(ruleName))
		) {
			return true;
		}
	}

	return false;
}

/**
 * @param {Problem} problem
 * @param {number} line
 */
function isFixApplied({ fix, result: { stylelint }, ruleName }, line) {
	const { disabledRanges, config = {}, fixersData } = stylelint;

	if (!isFn(fix)) {
		addFixData({ fixersData, ruleName, fixed: false });

		return false;
	}

	const shouldFix = Boolean(config.fix && !config.rules?.[ruleName][1]?.disableFix);
	const mayFix =
		shouldFix && (config.ignoreDisables || !isDisabled(ruleName, line, disabledRanges));

	addFixData({ fixersData, ruleName, fixed: mayFix });

	if (!mayFix) return false;

	fix();

	return true;
}

/**
 * @param {object} o
 * @param {StylelintPostcssResult['fixersData']} o.fixersData
 * @param {string} o.ruleName
 * @param {Range} [o.range]
 * @param {boolean} o.fixed
 * @todo stylelint/stylelint#7192
 */
function addFixData({ fixersData, ruleName, range, fixed }) {
	const ruleFixers = (fixersData[ruleName] ??= []);

	ruleFixers.push({ range, fixed });
}
