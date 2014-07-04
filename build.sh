#!/bin/sh

SCRIPT=`readlink -f $0`
SCRIPTPATH=`dirname $SCRIPT`
#echo $SCRIPTPATH

rm -rf compiled
mkdir compiled
mkdir -p compiled/_locales/en/
mkdir -p compiled/_locales/vi/

cp src/manifest.json compiled/
cp src/icon16.png compiled/
cp src/icon19.png compiled/
cp src/icon48.png compiled/
cp src/icon128.png compiled/
cp src/popup.html compiled/
cp src/_locales/en/messages.json compiled/_locales/en/
cp src/_locales/vi/messages.json compiled/_locales/vi/

java -jar compiler.jar --js src/avim.js --js_output_file compiled/avim.js
java -jar compiler.jar --js src/background.js --js_output_file compiled/background.js
java -jar compiler.jar --js src/popup.js --js_output_file compiled/popup.js

cd compiled
zip -9 -q -r avim.zip *
cd ..
mv compiled/avim.zip .

