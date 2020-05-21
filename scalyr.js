(function () {
    'use strict';

    let angular = window.angular;

    // You may just depend on the 'sly' module to pull in all of the
    // dependencies.
    angular.module('sly', ['slyEvaluate', 'slyRepeat']);

    /**
     * @fileoverview
     * Defines core functions used throughout the Scalyr javascript
     * code base.  This file is included on every page.
     *
     * @author Steven Czerwinski <czerwin@scalyr.com>
     */

    /**
     * Determines if obj has a property named prop.
     *
     * @param {Object} obj The object to check
     * @param {String} prop Propoe
     * @returns {Boolean} Returns true if obj has a property named
     *   prop.  Only considers the object's own properties
     */
    function hasProperty(obj, prop) {
        return obj.hasOwnProperty(prop);
    }

    /**
     * @param {*} value The value to check
     * @returns {Boolean} Returns true if value is a String
     *   and has zero length, or if null or undefined
     */
    function isStringEmpty(value) {
        return _.isNull(value) || _.isUndefined(value) ||
            (_.isString(value) && (value.length === 0));
    }

    /**
     * @param {*} value The value to check
     * @returns {Boolean} Returns true if value is a String
     *   and has non-zero length
     */
    function isStringNonempty(value) {
        return _.isString(value) && (value.length > 0);
    }

    /**
     * Returns true if obj1 and obj2 are equal.  This should
     * only be used for Arrays, Objects, and value types.  This is a deep
     * comparison, comparing each property and recursive property to
     * be equal (not just ===).
     *
     * Two Objects or values are considered equivalent if at least one of the following is true:
     *  - Both objects or values pass `===` comparison.
     *  - Both objects or values are of the same type and all of their properties pass areEqual
     *    comparison.
     *  - Both values are NaN. (In JavasScript, NaN == NaN => false. But we consider two NaN as equal).
     *
     * Note, during property comparision, properties with function values are ignores as are property
     * names beginning with '$'.
     *
     * See angular.equal for more details.
     *
     * @param {Object|Array|value} obj1 The first object
     * @param {Object|Array|value} obj2 The second object
     * @returns {Boolean} True if the two objects are equal using a deep
     *   comparison.
     */
    function areEqual(obj1, obj2) {
        return angular.equals(obj1, obj2);
    }

    /**
     * Returns a deep copy of source, where source can be an Object or an Array.  If a destination is
     * provided, all of its elements (for Array) or properties (for Objects) are deleted and then all
     * elements/properties from the source are copied to it.   If source is not an Object or Array,
     * source is returned.
     *
     * See angular.copy for more details.
     * @param {Object|Array} source The source
     * @param {Object|Array} destination Optional object to copy the elements to
     * @returns {Object|Array} The deep copy of source
     */
    function copy(source, destination) {
        return angular.copy(source, destination);
    }

    /**
     * Similar to defineScalyrJsLibary but instead of declaring
     * a purely javascript library, this declares an Angular module
     * library.  The moduleName should be a string used to identify
     * this module.  The dependencies is an array with the string
     * names of Angular modules, Scalyr Angular modules, or Scalyr
     * javascript libraries to depend on.  The returned object
     * can be used to define directives, etc similar to angular.module.
     *
     * Example:
     *  defineScalyrAngularModule('slyMyModule', [ 'myTextUtils'])
     *  .filter('camelCase', function(myTextUtils) {
     *     return function(input) {
     *       return myTextUtils.camelCase(input);
     *     };
     *  });
     *
     * @param {String} moduleName The name of the module
     * @param {Array} dependencies The names of modules to depend on
     */
    function defineScalyrAngularModule(moduleName, dependencies) {
        return angular.module(moduleName, dependencies);
    }

    /**
     * @fileoverview
     * Module: slyEvaluate
     *
     * Defines several directives related to preventing evaluating watchers
     * on scopes under certain conditions.  Here's a list of the directives
     * and brief descriptions.  See down below for more details.
     *
     *  slyEvaluateOnlyWhen:  A directive that prevents updating / evaluating
     *      all bindings for the current element and its children unless
     *      the expression has changed values.  If new children are added, they
     *      are always evaluated at least once.  It currently assumes the
     *      expression evaluates to an object and detects changes only by
     *      a change in object reference.
     *
     *  slyAlwaysEvaluate: Can only be used in conjunction with the
     *      slyEvaluateOnlyWhen directive.  This directive will ensure that
     *      any expression that is being watched will always be evaluated
     *      if it contains the specified string (i.e., it will ignore whether
     *      or not the slyEvaluateOnlyWhen expression has changed.)  This
     *      is useful when you wish to check some expressions all the time.
     *
     *  slyPreventEvaluationWhenHidden:  Will only evaluate the bindings
     *      for the current element and its children if the current element
     *      is not hidden (detected by the element having the ng-hide CSS class.)
     *
     *  slyShow:  Will hide the element if the expression evaluates to false.
     *      Uses ng-hide to hide the element.  This is almost exactly the same
     *      as ngShow, but it has the advantage that it works better with
     *      slyPreventEvaluationWhenHidden by guaranteeing it will always evaluate
     *      its show expression to determine if it should or should not be hidden.
     */
    defineScalyrAngularModule('slyEvaluate', ['gatedScope'])
        /**
         * Directive for preventing all bound expressions in the current element and its children
         * from being evaluated unless the specified expression evaluates to a different object.
         * Currently, the value assigned to the 'slyEvaluateOnlyWhen' must evaluate to an object.
         * Also, reference equality is used to determine if the expression has changed.
         * TODO: Make this more versatile, similar to $watch.  For now, this is all we need.
         */
        .directive('slyEvaluateOnlyWhen', ['$parse', function ($parse) {
            return {
                // We create a new scope just because it helps segment the gated watchers
                // from the parent scope.  Unclear if this is that important for perf.
                scope: true,
                restrict: 'A',
                compile: function compile(tElement, tAttrs) {
                    return {
                        // We need a separate pre-link function because we want to modify the scope before any of the
                        // children are passed it.
                        pre: function preLink(scope, element, attrs) {
                            let previousValue = null;
                            let initialized = false;

                            let expressionToCheck = $parse(attrs['slyEvaluateOnlyWhen']);
                            let alwaysEvaluateString = null;
                            if (hasProperty(attrs, 'slyAlwaysEvaluate')) {
                                alwaysEvaluateString = attrs['slyAlwaysEvaluate'];
                                if (isStringEmpty(alwaysEvaluateString)) {
                                    throw new Error('Empty string is illegal for value of slyAlwaysEvaluate');
                                }
                            }
                            scope.$addWatcherGate(function evaluteOnlyWhenChecker() {
                                // We should only return true if expressionToCheck evaluates to a value different
                                // than previousValue.
                                let currentValue = expressionToCheck(scope);
                                if (!initialized) {
                                    initialized = true;
                                    previousValue = currentValue;
                                    return true;
                                }
                                let result = previousValue !== currentValue;
                                previousValue = currentValue;
                                return result;
                            }, function shouldGateWatcher(watchExpression) {
                                // Should return true if the given watcher that's about to be registered should
                                // be gated.
                                return _.isNull(alwaysEvaluateString) ||
                                    !(isStringNonempty(watchExpression) && (watchExpression.indexOf(alwaysEvaluateString) >= 0));
                            }, true /* Evaluate any newly added watchers when they are added */);
                        }
                    };
                }
            };
        }])
        /**
         * Directive for overriding the 'slyEvaluateOnlyWhen' expression for the current element.
         * This directive takes a single string value.  If this string value is found anywhere in
         * an expression that normally would not be evaluated due to the 'slyEvaluateOnlyWhen'
         * directive, it is evaluated, regardless of whether or not the value for the expression in
         * 'slyEvaluateOnlyWhen' has changed.  This is very useful when a certain expression used by
         * one of the children of the current element should always be evaluated and is not affected
         * by the expression specified in slyEvaluateOnlyWhen.
         */
        .directive('slyAlwaysEvaluate', function () {
            // This is just a place holder to show that slyAlwaysEvaluate is a legal
            // directive.  The real work for this directive is done in slyEvaluateOnlyWhen.
            return {
                restrict: 'A',
                link: function (scope, element, attrs) {
                }
            };
        })
        /**
         * Directive for showing an element, very similar to ngShow.  However, this directive
         * works better with slyPreventEvaluationWhenHidden because it is ensure it always
         * will evaluate the show expression to determine if it should be shown or hidden
         * even if slyPreventEvaluationWhenHidden is in effect.  This directive also uses
         * the ng-hide css class to actually hide the element.
         *
         * NOTE: We might be able to get better performance if we have this directive directly
         * perform a callback on slyPreventEvaluationWhenHidden when it is shown/hidden rather
         * than having that directive register a watcher on the css class.
         */
        .directive('slyShow', ['$animate', function ($animate) {
            /**
             * @param {*} value The input
             * @return {Boolean} True if the value is truthy as determined by angular rules.
             *
             * Note:  This is copied from the Angular source because it is not exposed by Angular
             * but we want our directive to behave the same as ngShow.  Think about moving this
             * to core.js.
             */
            function toBoolean(value) {
                if (value && value.length !== 0) {
                    let v = ('' + value);
                    v = _.isString(v) ? v.toLowerCase() : v;
                    value = !(v === 'f' || v === '0' || v === 'false' || v === 'no' || v === 'n' || v === '[]');
                } else {
                    value = false;
                }
                return value;
            }

            return {
                restrict: 'A',
                link: function slyShowLink(scope, element, attr) {
                    scope.$watch(attr.slyShow, function ngSlyShowAction(value) {
                        $animate[toBoolean(value) ? 'removeClass' : 'addClass'](element, 'ng-hide');
                    }, false, 'slyShow');
                }
            };
        }])
        /**
         * Directive for preventing all bound expressions in the current element and its children
         * from being evaluated if the current element is hidden as determined by whether or not
         * it has the ng-hide class.
         */
        .directive('preventEvaluationWhenHidden', function () {
            return {
                restrict: 'A',
                // We create a new scope just because it helps segment the gated watchers
                // from the parent scope.  Unclear if this is that important for perf.
                scope: true,
                compile: function compile(tElement, tAttrs) {
                    return {
                        // We need a separate pre-link function because we want to modify the scope before any of the
                        // children are passed it.
                        pre: function preLink(scope, element, attrs) {
                            scope.$addWatcherGate(function hiddenChecker() {
                                let _isCompiled = !!scope.$$_hasFirstPreventEvaluationWhenHiddenCompilation;
                                scope.$$_hasFirstPreventEvaluationWhenHiddenCompilation = true;
                                // Should only return true if the element is not hidden.
                                return element.is(':visible') || !_isCompiled;
                            }, function hiddenDecider(watchExpression, listener, equality, directiveName) {
                                // Make an exception for slyShow.. do not gate its watcher.
                                return !(!_.isUndefined(directiveName) && (directiveName === 'slyShow'));
                            });
                        }
                    };
                }
            };
        });

    /**
     * @fileoverview
     * Module:  slyRepeat
     *
     * Contains the slyRepeat directive, which is is a modified version of the
     * ngRepeat directive that is meant to be more efficient for creating and
     * recreating large lists of bound elements.  In particular, it has an
     * optimization that will prevent DOM elements from being constantly created
     * and destroyed as the contents of the repeated elements change.  It does this
     * by not destroying DOM elements when they are no longer needed, but instead,
     * just hiding them. This might not work for all use cases, but for it does
     * for the ones we do wish to heavily optimize.  For eample, through profiling,
     * we found that destroying DOM elements when flipping through log view pages
     * represented a large chunk of CPU time.
     *
     * Cavaets:  The collection expression must evaluate to an array.  Animators
     *   will not work.  Track By does not work.  Use at your own peril.
     *
     * @author Steven Czerwinski <czerwin@scalyr.com>
     */
    defineScalyrAngularModule('slyRepeat', ['gatedScope'])
        .directive('slyRepeat', ['$animate', '$parse', function ($animate, $parse) {

            /**
             * Sets the scope contained in elementScope to gate all its
             * watchers based on the isActiveForRepeat proprety.
             *
             * @param {Object} elementScope The object containing the
             *   scope and isActiveForRepeat properties.
             */
            function gateWatchersForScope(elementScope) {
                elementScope.scope.$addWatcherGate(function () {
                    return elementScope.isActiveForRepeat;
                });
            }

            return {
                restrict: 'A',
                scope: true,
                transclude: 'element',
                priority: 1000,
                terminal: true,
                compile: function (element, attr, linker) {
                    // Most of the work is done in the post-link function.
                    return function ($scope, $element, $attr) {
                        // This code is largely based on ngRepeat.

                        // Parse the expression.  It should look like:
                        // x in some-expression
                        let expression = $attr.slyRepeat;
                        let match = expression.match(/^\s*(.+)\s+in\s+(.*?)$/);
                        if (!match) {
                            throw Error("Expected slyRepeat in form of '_item_ in _collection_' but got '" +
                                expression + "'.");
                        }

                        let iterVar = match[1];
                        let collectionExpr = match[2];

                        match = iterVar.match(/^(?:([\$\w]+))$/);
                        if (!match) {
                            throw Error("'item' in 'item in collection' should be identifier but got '" +
                                match + "'.");
                        }

                        // previousElements will store references to the already existing (DOM) elements
                        // that were last used for the last rendering of this repeat and were visible.
                        // We will re-use these elements when executing the next rendering of the repeat when
                        // the iteration value changes.
                        let previousElements = [];
                        // previousElementsBuffer will store references to the already existing (DOM) elements
                        // that are in the page but were not used for the last rendering of this repeat and were
                        // therefore marked as inactive and not visible.  This happens if the length of the repeat
                        // iteration goes down over time, since we do not remove the elements.  If the repeat length
                        // was first 10, then 5, we will end up with the last 5 elements in the previousElementBuffer.
                        // We keep this in case the length increases again.
                        let previousElementBuffer = [];

                        let deregisterCallback = $scope.$watchCollection(collectionExpr, function (collection) {
                            if (!collection) {
                                return;
                            }
                            if (!_.isArray(collection)) {
                                throw Error("'collection' did not evaluate to an array.  expression was " + collectionExpr);
                            }
                            let originalPreviousElementsLength = previousElements.length;
                            // First, reconcile previousElements and collection with respect to the previousElementBuffer.
                            // Basically, try to grow previousElements to collection.length if we can.
                            if ((previousElements.length < collection.length) && (previousElementBuffer.length > 0)) {
                                let limit = previousElements.length + previousElementBuffer.length;
                                if (limit > collection.length) {
                                    limit = collection.length;
                                }
                                previousElements = previousElements.concat(previousElementBuffer.splice(0, limit - previousElements.length));
                            }

                            let currentElements = null;
                            let currentElementBuffer = [];

                            let newElements = [];
                            if (collection.length > previousElements.length) {
                                // Add in enough elements to account for the larger collection.
                                for (let i = previousElements.length; i < collection.length; ++i) {
                                    // Need to add in an element for each new item in the collection.
                                    let newElement = {
                                        scope: $scope.$new(),
                                        isActiveForRepeat: true
                                    };

                                    gateWatchersForScope(newElement);
                                    newElement.scope.$index = i;
                                    newElement.scope.$first = (i === 0);
                                    newElements.push(newElement);
                                }
                                currentElements = previousElements.concat(newElements);
                                currentElementBuffer = previousElementBuffer;
                            } else if (collection.length < previousElements.length) {
                                for (let i = collection.length; i < previousElements.length; ++i) {
                                    previousElements[i].isActiveForRepeat = false;
                                }

                                currentElementBuffer = previousElements.splice(collection.length, previousElements.length - collection.length).concat(
                                    previousElementBuffer);
                                currentElements = previousElements;
                            } else {
                                currentElements = previousElements;
                                currentElementBuffer = previousElementBuffer;
                            }

                            // We have to fix up the last and middle values in the scope for each element in
                            // currentElements, since their roles may have changed with the new length.
                            // We always have to fix the last element.
                            if (currentElements.length > 0) {
                                let firstIndexToFix = currentElements.length - 1;
                                let lastIndexToFix = currentElements.length - 1;
                                // We also have to fix any new elements that were added.
                                if (originalPreviousElementsLength < currentElements.length) {
                                    firstIndexToFix = originalPreviousElementsLength;
                                }
                                // And we usually have to fix the element before the first element we modified
                                // in case it used to be last.
                                if (firstIndexToFix > 0) {
                                    firstIndexToFix = firstIndexToFix - 1;
                                }
                                for (let i = firstIndexToFix; i <= lastIndexToFix; ++i) {
                                    currentElements[i].scope.$last = (i === (currentElements.length - 1));
                                    currentElements[i].scope.$middle = ((i !== 0) && (i !== (currentElements.length - 1)));
                                    if (!currentElements[i].isActiveForRepeat) {
                                        // If it is not marked as active, make it active.  This is also indicates that
                                        // the element is currently hidden, so we have to unhide it.
                                        currentElements[i].isActiveForRepeat = true;
                                        currentElements[i].element.css('display', '');
                                    }
                                }
                            }

                            // Hide all elements that have recently become inactive.
                            for (let i = 0; i < currentElementBuffer.length; ++i) {
                                if (currentElementBuffer[i].isActiveForRepeat) {
                                    break;
                                }
                                currentElementBuffer[i].element.css('display', 'none');
                            }

                            // Assign the new value for the iter variable for each scope.
                            for (let i = 0; i < currentElements.length; ++i) {
                                currentElements[i].scope[iterVar] = collection[i];
                            }

                            // We have to go back now and clone the DOM element for any new elements we
                            // added and link them in.  We clone the last DOM element we had created already
                            // for this Repeat.
                            let prevElement = $element;
                            if (previousElements.length > 0) {
                                prevElement = previousElements[previousElements.length - 1].element;
                            }
                            for (let i = 0; i < newElements.length; ++i) {
                                linker(newElements[i].scope, function (clone) {
                                    $animate.enter(clone, null, prevElement);
                                    prevElement = clone;
                                    newElements[i].element = clone;
                                });
                            }

                            previousElements = currentElements;
                            previousElementBuffer = currentElementBuffer;
                        });
                        $scope.$on('$destroy', function () {
                            deregisterCallback();
                        });
                    };
                }
            };
        }]);
    /**
     * @fileoverview
     * Defines an extension to angular.Scope that allows for registering
     * 'gating functions' on a scope that will prevent all future watchers
     * registered on the scope from being evaluated unless the gating function
     * returns true.
     *
     * By depending on this module, the $rootScope instance and angular.Scope
     * class are automatically extended to implement this new capability.
     *
     * Warning, this implementation depends on protected/private variables
     * in the angular.Scope implementation and therefore can break in the
     * future due to changes in the angular.Scope implementation.  Use at
     * your own risk.
     */
    defineScalyrAngularModule('gatedScope', [])
        .config(['$provide', function ($provide) {
            // We use a decorator to override methods in $rootScope.
            $provide.decorator('$rootScope', ['$delegate', '$exceptionHandler',
                function ($rootScope, $exceptionHandler) {

                    // Make a copy of $rootScope's original methods so that we can access
                    // them to invoke super methods in the ones we override.
                    let scopePrototype = {};
                    for (let key in $rootScope) {
                        if (_.isFunction($rootScope[key])) {
                            scopePrototype[key] = $rootScope[key];
                        }
                    }

                    let Scope = $rootScope.constructor;

                    // Hold all of our new methods.
                    let methodsToAdd = {};

                    // A constant value that the $digest loop implementation depends on.  We
                    // grab it down below.
                    let initWatchVal;

                    /**
                     * @param {Boolean} isolate Whether or not the new scope should be isolated.
                     * @returns {Scope} A new child scope
                     */
                    methodsToAdd.$new = function (isolate) {
                        // Because of how scope.$new works, the returned result
                        // should already have our new methods.
                        let result = scopePrototype.$new.call(this, isolate);

                        // We just have to do the work that normally a child class's
                        // constructor would perform -- initializing our instance vars.
                        result.$$gatingFunction = this.$$gatingFunction;
                        result.$$parentGatingFunction = this.$$gatingFunction;
                        result.$$shouldGateFunction = this.$$shouldGateFunction;
                        result.$$gatedWatchers = [];
                        result.$$cleanUpQueue = this.$$cleanUpQueue;

                        return result;
                    };

                    /**
                     * Digests all of the gated watchers for the specified gating function.
                     *
                     * @param {Function} targetGatingFunction The gating function associated
                     *   with the watchers that should be digested
                     * @returns {Boolean} True if any of the watchers were dirty
                     */
                    methodsToAdd.$digestGated = function gatedScopeDigest(targetGatingFunction) {
                        // Note, most of this code was stolen from angular's Scope.$digest method.
                        let watch, value,
                            watchers,
                            length,
                            next, current = this, target = this, last,
                            dirty = false;

                        do { // "traverse the scopes" loop
                            // eslint-disable-next-line no-cond-assign
                            if (watchers = current.$$gatedWatchers) {
                                // process our watches
                                length = watchers.length;
                                while (length--) {
                                    try {
                                        watch = watchers[length];
                                        // Scalyr edit: We do not process a watch function if it is does not
                                        // have the same gating function for which $digestGated was invoked.
                                        if (watch.gatingFunction !== targetGatingFunction) {
                                            continue;
                                        }

                                        // Since we are about to execute the watcher as part of a digestGated
                                        // call, we can remove it from the normal digest queue if it was placed
                                        // there because the watcher was added after the gate function's first
                                        // evaluation.
                                        if (watch && !_.isNull(watch.cleanUp)) {
                                            watch.cleanUp();
                                            watch.cleanUp = null;
                                        }
                                        // Most common watches are on primitives, in which case we can short
                                        // circuit it with === operator, only when === fails do we use .equals
                                        if (watch && (value = watch.get(current)) !== (last = watch.last) &&
                                            !(watch.eq
                                                ? areEqual(value, last)
                                                : (typeof value === 'number' && typeof last === 'number'
                                                    && isNaN(value) && isNaN(last)))) {
                                            dirty = true;
                                            watch.last = watch.eq ? copy(value) : value;
                                            watch.fn(value, ((last === initWatchVal) ? value : last), current);
                                            // Scalyr edit:  Removed the logging code for when the ttl is reached
                                            // here because we don't have access to the ttl in this method.
                                        }
                                    } catch (e) {
                                        $exceptionHandler(e);
                                    }
                                }
                            }

                            // Insanity Warning: scope depth-first traversal
                            // yes, this code is a bit crazy, but it works and we have tests to prove it!
                            // Scalyr edit: This insanity warning was from angular.  We only modified this
                            // code by checking the $$gatingFunction because it's a good optimization to only go
                            // down a child of a parent that has the same gating function as what we are processing
                            // (since if a parent already has a different gating function, there's no way any
                            // of its children will have the right one).
                            if (!(next = ((current.$$gatingFunction === targetGatingFunction && current.$$childHead)
                                || (current !== target && current.$$nextSibling)))) {
                                while (current !== target && !(next = current.$$nextSibling)) {
                                    current = current.$parent;
                                }
                            }
                        } while ((current = next));

                        // Mark that this gating function has digested all children.
                        targetGatingFunction.hasDigested = true;
                        return dirty;
                    };

                    /**
                     * @inherited $watch
                     * @param directiveName The fourth parameter is a new optional parameter that allows
                     *   directives aware of this abstraction to pass in their own names to identify
                     *   which directive is registering the watch.  This is then passed to the
                     *   shouldGateFunction to help determine if the watcher should be gated by the current
                     *   gatingFunction.
                     */
                    methodsToAdd.$watch = function gatedWatch(watchExpression, listener, objectEquality, directiveName) {
                        // Determine if we should gate this watcher.
                        if (!_.isNull(this.$$gatingFunction) && (_.isNull(this.$$shouldGateFunction) ||
                            this.$$shouldGateFunction(watchExpression, listener, objectEquality, directiveName))) {
                            // We do a hack here to just switch out the watchers array with our own
                            // gated list and then invoke the original watch function.
                            let tmp = this.$$watchers;
                            this.$$watchers = this.$$gatedWatchers;
                            // Invoke original watch function.
                            let result = scopePrototype.$watch.call(this, watchExpression, listener, objectEquality);
                            this.$$watchers = tmp;
                            this.$$gatedWatchers[0].gatingFunction = this.$$gatingFunction;
                            this.$$gatedWatchers[0].cleanUp = null;

                            // We know that the last field of the watcher object will be set to initWatchVal, so we
                            // grab it here.
                            initWatchVal = this.$$gatedWatchers[0].last;
                            let watch = this.$$gatedWatchers[0];

                            // We should make sure the watch expression gets evaluated fully on at least one
                            // digest cycle even if the gate function is now closed if requested by the gating function's
                            // value for shouldEvalNewWatchers.  We do this by adding in normal watcher that will execute
                            // the watcher we just added and remove itself after the digest cycle completes.
                            if (this.$$gatingFunction.shouldEvalNewWatchers && this.$$gatingFunction.hasDigested) {
                                let self = this;
                                watch.cleanUp = scopePrototype.$watch.call(self, function () {
                                    if (!_.isNull(watch.cleanUp)) {
                                        self.$$cleanUpQueue.unshift(watch.cleanUp);
                                        watch.cleanUp = null;
                                    }
                                    let value;
                                    let last = initWatchVal;

                                    if (watch && (value = watch.get(self)) !== (last = watch.last) &&
                                        !(watch.eq
                                            ? areEqual(value, last)
                                            : (typeof value === 'number' && typeof last === 'number'
                                                && isNaN(value) && isNaN(last)))) {
                                        watch.last = watch.eq ? copy(value) : value;
                                        watch.fn(value, ((last === initWatchVal) ? value : last), self);
                                    }
                                    return watch.last;
                                });
                            }
                            return result;
                        } else {
                            return scopePrototype.$watch.call(this, watchExpression, listener, objectEquality);
                        }
                    };

                    /**
                     * @inherited $digest
                     */
                    methodsToAdd.$digest = function gatedDigest() {
                        // We have to take care if a scope's digest method was invoked that has a
                        // gating function in the parent scope.  In this case, the watcher for that
                        // gating function is registered in the parent (the one added in gatedWatch),
                        // and will not be evaluated here.  So, we have to manually see if the gating
                        // function is true and if so, evaluate any gated watchers for that function on
                        // this scope.  This needs to happen to properly support invoking $digest on a
                        // scope with a parent scope with a gating function.
                        // NOTE:  It is arguable that we are not correctly handling nested gating functions
                        // here since we do not know if the parent gating function was nested in other gating
                        // functions and should be evaluated at all.  However, if a caller is invoking
                        // $digest on a particular scope, we assume the caller is doing that because it
                        // knows the watchers should be evaluated.
                        let dirty = false;
                        if (!_.isNull(this.$$parentGatingFunction) && this.$$parentGatingFunction()) {
                            let ttl = 5;
                            do {
                                dirty = this.$digestGated(this.$$parentGatingFunction);
                                ttl--;

                                if (dirty && !(ttl--)) {
                                    throw Error(ttl + ' $digest() iterations reached for gated watcher. Aborting!\n' +
                                        'Watchers fired in the last 5 iterations.');
                                }
                            } while (dirty);
                        }

                        dirty = scopePrototype.$digest.call(this) || dirty;

                        let cleanUpQueue = this.$$cleanUpQueue;

                        while (cleanUpQueue.length) {
                            try {
                                cleanUpQueue.shift()();
                            } catch (e) {
                                $exceptionHandler(e);
                            }
                        }

                        return dirty;
                    };

                    /**
                     * Modifies this scope so that all future watchers registered by $watch will
                     * only be evaluated if gatingFunction returns true.  Optionally, you may specify
                     * a function that will be evaluted on every new call to $watch with the arguments
                     * passed to it, and that watcher will only be gated if the function returns true.
                     *
                     * @param {Function} gatingFunction The gating function which controls whether or not all future
                     *   watchers registered on this scope and its children will be evaluated on a given
                     *   digest cycle.  The function will be invoked (with no arguments) on every digest
                     *   and if it returns a truthy result, will cause all gated watchers to be evaluated.
                     * @param {Function} shouldGateFunction The function that controls whether or not
                     *   a new watcher will be gated using gatingFunction.  It is evaluated with the
                     *   arguments to $watch and should return true if the watcher created by those
                     *   arguments should be gated
                     * @param {Boolean} shouldEvalNewWatchers If true, if a watcher is added
                     *   after the gating function has returned true on a previous digest cycle, the
                     *   the new watcher will be evaluated on the next digest cycle even if the
                     *   gating function is currently return false.
                     */
                    methodsToAdd.$addWatcherGate = function (gatingFunction, shouldGateFunction, shouldEvalNewWatchers) {
                        let changeCount = 0;
                        let self = this;

                        // Set a watcher that sees if our gating function is true, and if so, digests
                        // all of our associated watchers.  Note, this.$watch could already have a
                        // gating function associated with it, which means this watch won't be executed
                        // unless all gating functions before us have evaluated to true.  We take special
                        // care of this nested case below.

                        // We handle nested gating function in a special way.  If we are a nested gating
                        // function (meaning there is already one or more gating functions on this scope and
                        // our parent scopes), then if those parent gating functions every all evaluate to
                        // true (which we can tell if the watcher we register here is evaluated), then
                        // we always evaluate our watcher until our gating function returns true.
                        let hasNestedGates = !_.isNull(this.$$gatingFunction);

                        (function () {
                            let promotedWatcher = null;

                            self.$watch(function () {
                                if (gatingFunction()) {
                                    if (self.$digestGated(gatingFunction)) {
                                        ++changeCount;
                                    }
                                } else if (hasNestedGates && _.isNull(promotedWatcher)) {
                                    promotedWatcher = scopePrototype.$watch.call(self, function () {
                                        if (gatingFunction()) {
                                            promotedWatcher();
                                            promotedWatcher = null;
                                            if (self.$digestGated(gatingFunction)) {
                                                ++changeCount;
                                            }
                                        }
                                        return changeCount;
                                    });
                                }
                                return changeCount;
                            });
                        })();

                        if (_.isUndefined(shouldGateFunction)) {
                            shouldGateFunction = null;
                        }
                        if (_.isUndefined(shouldEvalNewWatchers)) {
                            shouldEvalNewWatchers = false;
                        }
                        this.$$gatingFunction = gatingFunction;
                        this.$$gatingFunction.shouldEvalNewWatchers = shouldEvalNewWatchers;
                        this.$$shouldGateFunction = shouldGateFunction;
                    };

                    // Extend the original Scope object so that when
                    // new instances are created, it has the new methods.
                    angular.extend(Scope.prototype, methodsToAdd);

                    // Also extend the $rootScope instance since it was created
                    // before we got a chance to extend Scope.prototype.
                    angular.extend($rootScope, methodsToAdd);

                    $rootScope.$$gatingFunction = null;
                    $rootScope.$$parentGatingFunction = null;
                    $rootScope.$$shouldGateFunction = null;
                    $rootScope.$$gatedWatchers = [];
                    $rootScope.$$cleanUpQueue = [];

                    return $rootScope;
                }]);
        }]);
})();
