import isValidFontSize from '../isValidFontSize.mjs';

it('isValidFontSize', () => {
	expect(isValidFontSize('10px')).toBeTruthy();
	expect(isValidFontSize('20%')).toBeTruthy();
	expect(isValidFontSize('20')).toBeFalsy();
	expect(isValidFontSize('small')).toBeTruthy();
	expect(isValidFontSize('smaller')).toBeTruthy();
	expect(isValidFontSize('smallest')).toBeFalsy();
	expect(isValidFontSize('math')).toBeTruthy();
	expect(isValidFontSize(null)).toBeFalsy();
});
