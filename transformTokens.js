const StyleDictionary = require('style-dictionary');
const { Parser } = require('expr-eval');
const { parseToRgba } = require('color2k');
const calcAstParser = require('postcss-calc-ast-parser');
const path = require('path');
const glob = require('glob');
const util = require('util');

const fs = require('fs');

const asyncGlob = util.promisify(glob);

const fontWeightMap = {
  thin: 100,
  Thin: 100,
  extralight: 200,
  ExtraLight: 200,
  ultralight: 200,
  extraleicht: 200,
  light: 300,
  Light: 300,
  leicht: 300,
  normal: 400,
  Normal: 400,
  regular: 400,
  Regular: 400,
  buch: 400,
  medium: 500,
  Medium: 500,
  kraeftig: 500,
  kräftig: 500,
  semibold: 600,
  SemiBold: 600,
  'semi bold': 600,
  demibold: 600,
  halbfett: 600,
  bold: 700,
  Bold: 700,
  dreiviertelfett: 700,
  extrabold: 800,
  ExtraBold: 800,
  ultabold: 800,
  UltaBold: 800,
  fett: 800,
  black: 900,
  Black: 900,
  heavy: 900,
  super: 900,
  extrafett: 900,
};

const parser = new Parser();

function checkAndEvaluateMath(expr) {
  let calcParsed;
  try {
    calcParsed = calcAstParser.parse(expr);
  } catch (ex) {
    return expr;
  }

  const calcReduced = calcAstParser.reduceExpression(calcParsed);

  let unitlessExpr = expr;
  let unit = '';

  if (calcReduced && calcReduced.type !== 'Number') {
    unitlessExpr = expr.replace(new RegExp(calcReduced.unit, 'ig'), '');
    unit = calcReduced.unit;
  }

  let evaluated;

  try {
    evaluated = parser.evaluate(unitlessExpr);
  } catch (ex) {
    return expr;
  }
  try {
    return unit ? `${evaluated}${unit}` : Number.parseFloat(evaluated.toFixed(3));
  } catch {
    return expr;
  }
}

/**
 * Helper: Transforms dimensions to px
 */
function transformDimension(value) {
  if (value.endsWith('px')) {
    return value;
  }
  return value + 'px';
}

/**
 * Helper: Transforms letter spacing % to em
 */
function transformLetterSpacing(value) {
  if (value.endsWith('%')) {
    const percentValue = value.slice(0, -1);
    return `${percentValue / 100}em`;
  }
  return value;
}

/**
 * Helper: Transforms letter spacing % to em
 */
function transformFontWeights(value) {
  const mapped = fontWeightMap[value.toLowerCase()];
  // return `${mapped}`;
  return mapped ? `${mapped}` : value;
}

/**
 * Helper: Transforms hex rgba colors used in figma tokens: rgba(#ffffff, 0.5) =? rgba(255, 255, 255, 0.5). This is kind of like an alpha() function.
 */
function transformHEXRGBa(value) {
  if (value.startsWith('rgba(#')) {
    const [hex, alpha] = value.replace(')', '').split('rgba(').pop().split(', ');
    const [r, g, b] = parseToRgba(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else {
    return value;
  }
}

/**
 * Helper: Transforms boxShadow object to shadow shorthand
 * This currently works fine if every value uses an alias, but if any one of these use a raw value, it will not be transformed.
 */
function transformShadow(shadow) {
  if (typeof shadow === 'string') {
    if (shadow.startsWith('{') && shadow.endsWith('}')) {
      return `var(--${shadow.slice(1, -1).split('.').join('-')})`;
    }
  }
  const { x, y, blur, spread, color } = shadow;
  return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

/**
 * Helper: Transforms typography object to typography shorthand
 * This currently works fine if every value uses an alias, but if any one of these use a raw value, it will not be transformed.
 * If you'd like to output all typography values, you'd rather need to return the typography properties itself
 */
function transformTypography(value) {
  if (typeof value === 'string') {
    if (value.startsWith('{') && value.endsWith('}')) {
      return `var(--${value.slice(1, -1).split('.').join('-')})`;
    }
  }

  const { fontWeight = '', fontSize = '', lineHeight = '', fontFamily = '' } = value;

  return `${fontWeight} ${fontSize}px${lineHeight ? `/${lineHeight}` : ''} ${fontFamily}`;
}

/**
 * Transform typography shorthands for css variables
 */
StyleDictionary.registerTransform({
  name: 'typography/shorthand',
  type: 'value',
  transitive: true,
  matcher: (token) => token.type === 'typography',
  transformer: (token) => {
    return transformTypography(token.original.value);
  },
});

/**
 *  css url property cannot interpolate variables so the url definition must be in the token itself
 */
StyleDictionary.registerTransform({
  name: 'assets/background',
  type: 'value',
  transitive: true,
  matcher: (token) => token.type === 'asset',
  // Putting this in strings seems to be required
  transformer: (token) => `url(${token.value})`,
});

/**
 *  for font awesome to work we need the following format for the content property : \unicode
 */
StyleDictionary.registerTransform({
  name: 'icons',
  type: 'value',
  transitive: true,
  matcher: (token) => token.type === 'icon',
  // Putting this in strings seems to be required
  transformer: (token) => `"\\${token.value}"`,
});

/**
 * Transform shadow shorthands for css variables
 */
StyleDictionary.registerTransform({
  name: 'shadow/shorthand',
  type: 'value',
  transitive: true,
  matcher: (token) => ['boxShadow'].includes(token.type),
  transformer: (token) => {
    return Array.isArray(token.original.value)
      ? token.original.value.map((single) => transformShadow(single)).join(', ')
      : transformShadow(token.original.value);
  },
});

/**
 * Transform fontSizes to px
 */
StyleDictionary.registerTransform({
  name: 'size/px',
  type: 'value',
  transitive: true,
  matcher: (token) => ['dimension', 'borderRadius', 'borderWidth', 'spacing', 'sizing'].includes(token.type),
  transformer: (token) => transformDimension(token.value),
});

/**
 * Transform letterSpacing to em
 */
StyleDictionary.registerTransform({
  name: 'size/letterspacing',
  type: 'value',
  transitive: true,
  matcher: (token) => token.type === 'letterSpacing',
  transformer: (token) => transformLetterSpacing(token.value),
});

/**
 * Transform fontWeights to numerical
 */
StyleDictionary.registerTransform({
  name: 'type/fontWeight',
  type: 'value',
  transitive: true,
  matcher: (token) => token.type === 'fontWeights',
  transformer: (token) => transformFontWeights(token.value),
});

/**
 * Transform rgba colors to usable rgba
 */
StyleDictionary.registerTransform({
  name: 'color/hexrgba',
  type: 'value',
  transitive: true,
  matcher: (token) => typeof token.value === 'string' && token.value.startsWith('rgba(#'),
  transformer: (token) => transformHEXRGBa(token.value),
});

/**
 * Transform to resolve math across all tokens
 */
StyleDictionary.registerTransform({
  name: 'resolveMath',
  type: 'value',
  transitive: true,
  matcher: (token) => token,
  // Putting this in strings seems to be required
  transformer: (token) => `${checkAndEvaluateMath(token.value)}`,
});

function convertToSafeThemeName(themeName) {
  const safeName = themeName.replace(' ', '-').replace(/[^0-9a-zA-Z-]/g, '');
  return safeName;
}

function getStyleDictionaryConfig(themeName, themeTokenSets) {
  return {
    source: themeTokenSets,
    platforms: {
      css: {
        transforms: [
          'resolveMath',
          'icons',
          'size/px',
          'size/letterspacing',
          'assets/background',
          'type/fontWeight',
          'color/hexrgba',
          'typography/shorthand',
          'shadow/shorthand',
          'name/cti/kebab',
        ],
        buildPath: `build/css/`,
        files: [
          {
            destination: `${convertToSafeThemeName(themeName)}.css`,
            format: 'css/variables',
            selector: `.${convertToSafeThemeName(themeName)}`,
          },
        ],
      },
      js: {
        transformGroup: 'js',
        buildPath: 'build/js/',
        files: [
          {
            destination: `${convertToSafeThemeName(themeName)}.js`,
            format: 'javascript/es6',
          },
        ],
      },
    },
  };
}

async function transformTokens() {
  console.log('Build started...');
  console.log('\n==============================================');
  const themesPath = await asyncGlob('**/$themes.json', { fs, mark: true });
  const metadataPath = await asyncGlob('**/$metadata.json', { fs, mark: true });

  if (themesPath[0] && metadataPath[0]) {
    const rootFolders = themesPath[0].split('/').slice(0, -1).join('/');

    const themeFiles = JSON.parse(fs.readFileSync(themesPath[0], 'utf-8'));
    const orderMetadata = JSON.parse(fs.readFileSync(metadataPath[0], 'utf-8'));

    for (const theme of themeFiles) {
      const { name: themeName, selectedTokenSets } = theme;
      const themeTokenSets = orderMetadata.tokenSetOrder
        .filter((tokenSet) => selectedTokenSets[tokenSet] !== 'disabled')
        .map((set) => `${rootFolders}/${set}.json`);

      const themeConfig = getStyleDictionaryConfig(themeName, themeTokenSets);
      const SD = StyleDictionary.extend(themeConfig);
      SD.buildAllPlatforms();
    }
  }
}

transformTokens().finally(() => {
  console.log('\n==============================================');
  console.log('\nBuild completed!');
});
