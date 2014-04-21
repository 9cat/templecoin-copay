'use strict';

angular.module('copay',[
  'ngRoute',
  'mm.foundation',
  'monospaced.qrcode',
  'copay.header',
  'copay.addresses',
  'copay.transactions',
  'copay.send',
  'copay.backup',
  'copay.walletFactory',
  'copay.signin',
  'copay.socket',
  'copay.controllerUtils',
  'copay.setup',
  'copay.peer'
]);

angular.module('copay.header', []);
angular.module('copay.addresses', []);
angular.module('copay.transactions', []);
angular.module('copay.send', []);
angular.module('copay.backup', []);
angular.module('copay.walletFactory', []);
angular.module('copay.controllerUtils', []);
angular.module('copay.signin', []);
angular.module('copay.setup', []);
angular.module('copay.peer', []);
angular.module('copay.socket', []);

