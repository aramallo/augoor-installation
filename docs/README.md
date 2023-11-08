# README

This directory contains the source code of the documentation website. It uses [Vitepress](https://vitepress.dev/), a static site generator.

## Requirements

* NodeJS
* yarn

## Installing Vitepress

On the terminal change to this directory and run the following command to install Vitepress

```bash
yarn add --dev vitepress
```

This will result in the following directory structure

```
.
├── README.md
├── api-examples.md
├── guides
├── index.md
├── node_modules
├── package.json
├── public
└── yarn.lock
```


## Running the documentation server
When writing the documentation you can open a server that will dynamically render your changes to the Markdown files. The following command will run a server. Click on the provided link and a browser window will open the documentation homepage.

```bash
yarn docs:dev
```


## Building the documentation website

```bash
yarn docs:build
```

This will create the directory `dist` within `docs/.vitepress`. You can now copy this directory to your target webserver root to serve the static website.

## Content Development

### Images
Images should be located in the `public` folder.

To embed an image in markdown you should use the absolute path to the image e.g. `/my-image.png`.

Example:
```markdown
![Components of Azure Installation](/Azure.drawio.png)
```