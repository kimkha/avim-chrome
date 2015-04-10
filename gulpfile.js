'use strict';

//npm install gulp gulp-minify-css gulp-uglify gulp-clean gulp-cleanhtml gulp-jshint gulp-strip-debug gulp-zip --save-dev

var gulp = require('gulp'),
	del = require('del'),
	cleanhtml = require('gulp-cleanhtml'),
	minifycss = require('gulp-minify-css'),
	jshint = require('gulp-jshint'),
	stripdebug = require('gulp-strip-debug'),
	uglify = require('gulp-uglify'),
	concat = require('gulp-concat-util'),
	jasmine = require('gulp-jasmine'),
	jeditor = require("gulp-json-editor"),
	zip = require('gulp-zip');

//clean build directory
gulp.task('clean', function(cb) {
	del(["build/*"], cb);
});

//copy static folders to build directory
gulp.task('copy', function() {
	gulp.src('src/fonts/**')
		.pipe(gulp.dest('build/fonts'));
	gulp.src('src/icons/**')
		.pipe(gulp.dest('build/icons'));
	return gulp.src('src/_locales/**')
		.pipe(gulp.dest('build/_locales'));
	return gulp.src('src/manifest.json')
		.pipe(gulp.dest('build'));
});

//copy and compress HTML files
gulp.task('html', function() {
	return gulp.src('src/*.html')
		.pipe(cleanhtml())
		.pipe(gulp.dest('build'));
});

//run scripts through JSHint
gulp.task('jshint', function() {
	return gulp.src('src/scripts/*.js')
		.pipe(jshint())
		.pipe(jshint.reporter('default'));
});

//run test script with jasmine
gulp.task('test', ['jshint'], function () {
    return gulp.src('test/avim.test.js')
        .pipe(jasmine());
});

//copy vendor scripts and uglify all other scripts, creating source maps
gulp.task('scripts', ['test'], function() {
	gulp.src('src/scripts/vendors/**/*.js')
		.pipe(gulp.dest('build/scripts/vendors'));
	
	gulp.src("src/manifest.json")
		.pipe(jeditor(function(json) {
			json.content_scripts[0].js = [ "scripts/avim.js" ];
			return json;
		}))
		.pipe(gulp.dest('build'))
	
	var opt = {
			outSourceMap: true,
			mangle: {
				"toplevel": true,
				"eval": true,
				"except": "chrome"
			}
		};
	
	gulp.src(['src/chrome/**/*.js', '!src/chrome/vendors/**/*.js'])
		.pipe(stripdebug())
		.pipe(uglify(opt))
		.pipe(gulp.dest('build/chrome'));
	
	return gulp.src(['src/scripts/**/*.js', '!src/scripts/vendors/**/*.js'])
		.pipe(concat('avim.js'))
		.pipe(stripdebug())
		.pipe(uglify(opt))
		.pipe(gulp.dest('build/scripts'));
});

//minify styles
gulp.task('styles', function() {
// 	return gulp.src('src/styles/**/*.css')
// 		.pipe(minifycss({root: 'src/styles', keepSpecialComments: 0}))
// 		.pipe(gulp.dest('build/styles'));
	return gulp.src('src/styles/**')
		.pipe(gulp.dest('build/styles'));
});

//build ditributable and sourcemaps after other tasks completed
gulp.task('zip', ['html', 'scripts', 'styles', 'copy'], function() {
	var manifest = require('./src/manifest.json'),
		distFileName = 'avim-chrome-' + manifest.version + '.zip',
		mapFileName = 'avim-chrome-' + manifest.version + '-maps.zip';
	//collect all source maps
	gulp.src('build/scripts/**/*.map')
		.pipe(zip(mapFileName))
		.pipe(gulp.dest('dist'));
	//build distributable extension
	return gulp.src(['build/**', '!build/scripts/**/*.map'])
		.pipe(zip(distFileName))
		.pipe(gulp.dest('dist'));
});

//run all tasks after build directory has been cleaned
gulp.task('default', ['clean'], function() {
    gulp.start('zip');
});
