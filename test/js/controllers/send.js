'use strict';

angular.module('copay.send').controller('SendController',
  function($scope, $rootScope, $location) {
    $scope.title = 'Send';

    $scope.unitIds = ['BTC','mBTC'];
    $scope.selectedUnit = $scope.unitIds[0];

    $scope.submitForm = function(form) {
      if (form.$invalid) {
        $rootScope.flashMessage = { message: 'You can not send a proposal transaction. Please, try again', type: 'error'};
        return;
      }

      var address = form.address.$modelValue;
      var amount = (form.amount.$modelValue * 100000000).toString(); // satoshi to string

      var w = $rootScope.wallet;
      w.createTx( address, amount,function() {

        // reset fields
        $scope.address = null;
        $scope.amount = null;
        form.address.$pristine = true;
        form.amount.$pristine = true;
        $rootScope.flashMessage = { message: 'The transaction proposal has been created', type: 'success'};
        $rootScope.$digest();
      });
     
		};
  });
