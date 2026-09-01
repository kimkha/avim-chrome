'use strict';

var gulp = require('gulp'),
	del = require('del'),
	cleanhtml = require('gulp-cleanhtml'),
	jshint = require('gulp-jshint'),
	stripdebug = require('gulp-strip-debug'),
	uglify = require('gulp-uglify'),
	concat = require('gulp-concat-util'),
	jeditor = require('gulp-json-editor'),
	zip = require('gulp-zip');

gulp.task('clean', function() {
	return del(['build/*']);
});

gulp.task('copy', function() {
	return gulp.src(['src/icons/**', 'src/_locales/**', 'src/fonts/**'], {base: 'src', allowEmpty: true})
		.pipe(gulp.dest('build'));
});

gulp.task('html', function() {
	return gulp.src('src/*.html')
		.pipe(cleanhtml())
		.pipe(gulp.dest('build'));
});

gulp.task('jshint', function() {
	return gulp.src('src/scripts/*.js')
		.pipe(jshint())
		.pipe(jshint.reporter('default'));
});

gulp.task('scripts', gulp.series('jshint', function() {
	gulp.src('src/scripts/vendors/**/*.js', {allowEmpty: true})
		.pipe(gulp.dest('build/scripts/vendors'));

	gulp.src('src/manifest.json')
		.pipe(jeditor(function(json) {
			json.content_scripts[0].js = ['scripts/avim.js'];
			return json;
		}))
		.pipe(gulp.dest('build'));

	var opt = {
		mangle: {
			toplevel: true,
			eval: true,
			reserved: ['chrome']
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
}));

gulp.task('styles', function() {
	return gulp.src('src/styles/**', {allowEmpty: true})
		.pipe(gulp.dest('build/styles'));
});

gulp.task('zip', gulp.series('html', 'scripts', 'styles', 'copy', function() {
	var manifest = require('./src/manifest.json'),
		distFileName = 'avim-chrome-' + manifest.version + '.zip',
		mapFileName = 'avim-chrome-' + manifest.version + '-maps.zip';

	gulp.src('build/scripts/**/*.map', {allowEmpty: true})
		.pipe(zip(mapFileName))
		.pipe(gulp.dest('dist'));

	return gulp.src(['build/**', '!build/scripts/**/*.map'])
		.pipe(zip(distFileName))
		.pipe(gulp.dest('dist'));
}));

gulp.task('default', gulp.series('clean', 'zip'));
