import gulp from 'gulp';
import * as dartSass from 'sass';
import gulpSass from 'gulp-sass';
import sassGlob from 'gulp-sass-glob';
import postcss from 'gulp-postcss';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import {deleteAsync} from 'del';
import browserSync from 'browser-sync';
import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import esbuild from 'gulp-esbuild';
import sharp from 'sharp';
import through2 from 'through2';
import gulpNewer from 'gulp-newer';
import {optimize} from 'svgo'

const bs = browserSync.create();
const sass = gulpSass(dartSass);

const rasterSrc = 'src/img/*.{jpg,jpeg,png}';
const rasterDest = 'dist/img';
const svgSrc = 'src/img/*.svg';
const svgDest = 'dist/img';

const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;

const paths = {
  src: 'src',
  dist: 'dist',
  html: {
    src: 'src/**/*.html',
    dest: 'dist',
  },
  styles: {
    entry: 'src/styles/main.scss',
    watch: 'src/styles/**/*.scss',
    dest: 'dist/css',
  },
  scripts: {
    entry: 'src/js/index.js',
    watch: 'src/js/**/*.js',
    dest: 'dist/js',
  },
  assets: {
    src: [
      'src/fonts/**/*',
      'src/favicons/**/*',
      'src/site.webmanifest',
      'src/favicon.ico',
    ],
    base: 'src',
    dest: 'dist',
  }
}

export function clean() {
  return deleteAsync([paths.dist]);
}

export function html() {
  return gulp.src(paths.html.src)
    .pipe(gulp.dest(paths.html.dest))
    .pipe(bs.stream());
}

export function styles() {
  const plugins = [autoprefixer()];
  if (isProd) plugins.push(cssnano());

  return gulp.src(paths.styles.entry, {sourcemaps: isDev})
    .pipe(sassGlob())
    .pipe(sass.sync({outputStyle: 'expanded'}).on('error', sass.logError))
    .pipe(postcss(plugins))
    .pipe(gulp.dest(paths.styles.dest, {sourcemaps: isDev}))
    .pipe(bs.stream());
}

export function optimizeRaster() {
  return gulp.src(rasterSrc)
    .pipe(gulpNewer(rasterDest))
    .pipe(through2.obj(async (file, _, cb) => {
      try {
        file.contents = await sharp(file.path)
          .toColorspace('srgb')
          .jpeg({quality: 80, progressive: true, mozjpeg: true})
          .toBuffer();
        file.extname = '.jpg';
        cb(null, file);
      } catch {
        cb();
      }
    }))
    .pipe(gulp.dest(rasterDest));
}

export function optimizeVector() {
  return gulp.src(svgSrc)
    .pipe(gulpNewer(svgDest))
    .pipe(through2.obj((file, _, cb) => {
      if (!file.isBuffer()) return cb(null, file);
      try {
        const {data} = optimize(file.contents.toString(), {
          multipass: true,
          floatPrecision: 2,
          plugins: [
            { name: 'removeViewBox', active: false },
          ]
        })
        file.contents = Buffer.from(data)
        cb(null, file)
      } catch (e) {
        cb(e)
      }
    }))
    .pipe(gulp.dest(svgDest))
}

// --- SCRIPTS: esbuild bundle
export function scripts() {
  const target = browserslistToEsbuild(browserslist());

  return gulp.src(paths.scripts.entry)
    .pipe(esbuild({
      bundle: true,
      format: 'iife',
      sourcemap: isDev,
      minify: isProd,
      target,
      outfile: 'bundle.js' // имя итогового файла в dest
    }))
    .pipe(gulp.dest(paths.scripts.dest))
    .pipe(bs.stream())
}

// --- ASSETS: просто копируем статику как есть
export function assets() {
  return gulp.src(paths.assets.src, {base: paths.assets.base, allowEmpty: true})
    .pipe(gulp.dest(paths.assets.dest))
    .pipe(bs.stream());
}

// --- сервер разработки
export function serve(done) {
  bs.init({
    server: {baseDir: paths.dist},
    notify: false,
    open: false,
  });
  done();
}

// --- наблюдение
export function watcher() {
  gulp.watch(paths.html.src, html);
  gulp.watch(paths.styles.watch, styles);
  gulp.watch('src/img/*.{jpg,jpeg,png}', optimizeRaster);
  gulp.watch('src/img/*.svg', optimizeVector)
  gulp.watch(paths.scripts.watch, scripts);
  gulp.watch(paths.assets.src, assets);
}

// --- вспомогательный таск: установить PROD для билда
export function setProd(done) {
  process.env.NODE_ENV = 'production';
  done();
}

// --- сборки
export const build = gulp.series(
  setProd,
  clean,
  gulp.parallel(html, styles, scripts, assets),
  optimizeRaster,
  optimizeVector,
)

export const dev = gulp.series(
  clean,
  gulp.parallel(html, styles, scripts, assets),
  optimizeRaster,
  optimizeVector,
  serve,
  watcher,
)

export default dev
