# How to use the playground

Token zen garden demonstrates the power of design tokens. Create you own themes in the figma file, export the token json
files & upload them here. Publish your theme and share with the world.

## Using the exported files

You can export the files by using the download all files button located in the bottom left corner of the playground. Open the package with your favourite code editor, and run the command bellow. This will generate the css & js files for each theme.

```bash
yarn install && yarn build
```

## Custom html & css

The html & css files are not meant to be edited. While you can edit them and experiment in the playground, when you publish the token set only the token files will be published.

## Style dictionary config

The style dictionary config (transformTokens.js) is read only. Editing this file will not have any effect on the transformed tokens. Start from this and create your own custom SD configuration.

## Figma

https://www.figma.com/community/file/1172564146985130196
