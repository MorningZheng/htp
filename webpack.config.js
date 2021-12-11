const path = require('path');  //引入node的path模块
// const nodeExternals = require('webpack-node-externals');
// const copyWebpackPlugin=require('copy-webpack-plugin');
const webpack=require('webpack');
// const TerserPlugin=require('terser-webpack-plugin');
const {writeFile}=require('fs');

class packageCopyPlugin {
    constructor(source) {
        this.source=source;
    };

    apply(compiler) {
    //     const pluginName = this.constructor.name;
    //     compiler.hooks.thisCompilation.tap(pluginName, compilation => {
    //         compilation.hooks.additionalAssets.tapAsync(pluginName, async callback => {
    //             const data=require(this.source);
    //             const temp=["name","version","description","main","author","license",].reduce((o,k)=>{
    //                 o[k]=data[k];
    //                 return o;
    //             },{});
    //
    //             if(data.dependencies){
    //                 temp.dependencies={};
    //                 for(let k in data.dependencies){
    //                     if(k.indexOf('babel')===-1 && k.indexOf('webpack')===-1)temp.dependencies[k]=data.dependencies[k];
    //                 };
    //             };
    //
    //             writeFile(path.join(compiler.options.output.path,'package.json'),JSON.stringify(temp,null,'\t'),callback);
    //         });
    //     });
    };
};

module.exports = {
    entry: './main.js',
    output: {       //webpack如何输出
        path: path.resolve(__dirname, 'dist'), //定位，输出文件的目标路径
        filename: '[name].js'
    },
    externals: {
        bufferutil: "bufferutil",
        "utf-8-validate": "utf-8-validate",
    },
    // externals:[nodeExternals(),],
    target: 'node',
    node: {
        global: false,
        __filename: false,
        __dirname: false,
    },
    mode: 'production',
    // module: {
    //     unknownContextCritical : false,
    //     rules: [
    //         {
    //             test: /\.js$/,
    //             use: {
    //                 loader: 'babel-loader',
    //                 options:{
    //                     presets: [['@babel/preset-env',{targets:{node: 'current'},modules:'commonjs'}],],
    //                     plugins: ['@babel/plugin-proposal-class-properties',],
    //                 }
    //             },
    //             // exclude: [
    //             //     path.resolve(__dirname, 'node_modules'),
    //             //     /\.min\.js$/,
    //             // ],
    //
    //         },
    //     ]
    // },
    resolve: { //解析模块的可选项
        // modules: [ ]//模块的查找目录 配置其他的css等文件
        extensions: ['.js', '.json', ],  //用到文件的扩展名
        alias: { //模快别名列表
            utils: path.resolve(__dirname,'src/utils')
        }
    },
    plugins: [
        // new webpack.DefinePlugin({ 'global.GENTLY': false }),
        // new copyWebpackPlugin({ patterns:
        //         [
        //             './config.yaml',{from:'./htdocs',to:'htdocs'}
        //         ]
        // }),
        // new packageCopyPlugin(path.join(__dirname,'./package.json'))
    ],
    // optimization:{
    //     minimizer:[(compiler) => {
    //         new TerserPlugin({
    //             exclude: [/\.min\.js$/,],//path.join(__dirname,'main.js')
    //             terserOptions:{
    //                 mangle: false,
    //             },
    //             // minify:function (file,sourceMap,minimizerOptions) {
    //             //
    //             //     console.log(minimizerOptions)
    //             // },
    //         }).apply(compiler);
    //     }]
    // }
}