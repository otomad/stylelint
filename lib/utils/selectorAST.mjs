import selectorParser from 'postcss-selector-parser';

/**
 * @param {string} selector
 * @param {import('stylelint').PostcssResult} result
 * @param {import('postcss').Node} node
 * @returns {import('postcss-selector-parser').Root | undefined}
 */
export default function selectorAST(selector, result, node) {
	try {
		const root = selectorParser().astSync(selector);

		// // @ts-ignore the `node` field doesn't exist on the source type.
		// if (root.source) {
		// 	root.source.node = node;
		// }

		// if ('walk' in root) {
		// 	root.walk((x) => {
		// 		if (x.source) {
		// 			// @ts-ignore the `node` field doesn't exist on the source type.
		// 			x.source.node = node;
		// 		}
		// 	});
		// }

		return root;
	} catch (err) {
		result.warn(`Cannot parse selector (${err})`, { node, stylelintType: 'parseError' });

		return undefined;
	}
}
