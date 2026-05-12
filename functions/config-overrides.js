// config-overrides.js
const { override, addWebpackAlias } = require('customize-cra');
const path = require('path');

// 🔧 Esta es la forma correcta de sobrescribir el devServer en react-app-rewired
const customDevServer = (configFunction) => {
  return (proxy, allowedHost) => {
    const config = configFunction(proxy, allowedHost);
    config.allowedHosts = 'all'; // ← Aquí está el fix real
    return config;
  };
};

module.exports = {
  webpack: override(
    addWebpackAlias({
      'react-router/dom': path.resolve(__dirname, 'node_modules/react-router')
    })
  ),
  devServer: customDevServer
};
