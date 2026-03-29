const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    sidepanel: './src/sidepanel.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        {
          from: 'sidepanel.html',
          to: 'sidepanel.html',
          transform(content) {
            return content
              .toString()
              .replace('src="dist/sidepanel.js"', 'src="sidepanel.js"');
          }
        },
        { from: 'sidepanel.css', to: 'sidepanel.css' },
        { from: 'assets/logo1sms.webp', to: 'assets/logo1sms.webp' },
        { from: 'assets/icons', to: 'assets/icons' }
      ]
    })
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  }
};
