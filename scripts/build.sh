#!/bin/sh

esbuild \
  --bundle --platform=node --sourcemap=inline --minify --charset=utf8 \
  --banner:js="#!/usr/bin/env node" \
  ./src/main.ts \
  --outfile=./dist/main.js
