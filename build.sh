#!/bin/bash
echo "Current directory:"
pwd
echo -e "\nDirectory contents:"
ls -la
echo -e "\nMoving to /opt/render/project/src:"
cd /opt/render/project/src
echo -e "\nNew directory contents:"
ls -la
echo -e "\nCopying frontend files:"
cp -r frontend/* .
echo -e "\nDirectory after copy:"
ls -la
echo -e "\nPackage.json contents:"
cat package.json
echo -e "\nInstalling dependencies:"
npm install
echo -e "\nBuilding project:"
npm run build
