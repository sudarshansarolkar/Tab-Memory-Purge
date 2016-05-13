﻿/* global Database */
(function() {
  "use strict";

  //{{{ variables.
  let beep = closureCreateBeep().bind(null, 100, 800, 0.5, 'triangle');

  let ext_opts = new Map();

  /**
   * set setInterval returned value.
   * key   = tabId
   * value = return setInterval value.
   */
  let ticked = new Map();

  // Set the setInterval id of interval process.
  // While extension is running, continue to run.
  let continue_run = new Map();

  /**
   * When purge tabs, the object that the scroll position of purging tabs
   * is saved.
   * key   = tabId
   * value = the object that represent the scroll position(x, y).
   */
  let tmp_scroll_pos = new Map();

  // the string that represents the temporary exclusion list
  let temp_release = new Set();

  // Before selecting the active tab, and the user has been selected tab.
  let old_active_ids = new Map() ;

  let db                     = null; // indexedDB.
  let current_session_time = 0;

  /// key: tabId, value: represent an icon.
  let icon_states          = new Map();

  let current_tab_id       = 0; // webRequest only.
  let disable_auto_purge  = false;

  let create_tab_ids        = new Set();
  //}}}

  function getOpts(pKey)//{{{
  {
    console.info('getOpts', Array.prototype.slice.call(arguments));

    if (ext_opts.has(pKey)) {
      return ext_opts.get(pKey);
    } else if (gMapDefaultValues.has(pKey)) {
      return gMapDefaultValues.get(pKey);
    }
    throw new Error(`Doesn't get the options: ${pKey}`);
  }//}}}

  let unloaded_change = false;
  /**
   * This instance object has created by closureCreateMapObserve function.
   * A key and a value are added
   * when have been running about the release process of a tab.
   *
   * key = tabId.
   * value = object.
   *    the values in the object are following.
   *       url            : the url before purging.
   *       scrollPosition : the object that represent the scroll position(x, y).
   *       windowId       : the windowId of the purged tab.
   */
  let unloaded_observe = closureCreateMapObserve(changed => {//{{{
    console.info('unloaded_observe was changed.', Object.assign({}, changed));

    let tab_id = parseInt(changed.key, 10);
    switch (changed.type) {
      case 'add':
        deleteTick(tab_id);
        chrome.tabs.get(tab_id, tab => {
          if (!isReleasePage(tab.url)) {
            writeHistory(tab);
          }
        });
        break;
      case 'delete':
        if (changed.hasOwnProperty('oldValue')) {
          tmp_scroll_pos.set(tab_id, changed.oldValue.scrollPosition);
        }
        setTick(tab_id).catch(e => console.error(e));
        break;
    }
    chrome.browserAction.setBadgeText(
      { text: unloaded_observe.size().toString() });

    unloaded_change = true;
  });//}}}

  /**
   * setUnloaded
   *
   * Adds to unloaded_observe.
   *
   * @param {any} pKeyName -
   *     You want to add the key name.
   *     normally, the id of the tab.
   * @param {string} pUrl - You want to add the url.
   * @param {number} pWindowId - You want to add the windowId of tab.
   * @param {object} [pPos] -
   *     You want to add scrollPosition of the page of the tab.
   * @return {undefined}
   */
  function setUnloaded(pKeyName, pUrl, pWindowId, pPos)//{{{
  {
    console.info('setUnloaded', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ ],
      [ 'string' ],
      [ 'number' ],
      [ 'object', 'null', 'undefined' ],
    ], true);
    if (err_msg) {
      throw new Error(err_msg);
    }

    unloaded_observe.set(pKeyName, {
      url            : pUrl,
      windowId       : pWindowId,
      scrollPosition : pPos || { x : 0 , y : 0 },
    });
  }//}}}

  /**
   * Return the split object of the arguments of the url.
   *
   * @param {String} pUrl -  the url of getting parameters.
   * @param {String} pName -  the target parameter name.
   * @return {String} the string of a parameter.
   */
  function getParameterByName(pUrl, pName)//{{{
  {
    console.info('getParameterByName', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'string' ],
      [ 'string' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    let lRegParameter = new RegExp(`[\\?&]${pName}\s*=\s*([^&#]*)`);
    let lStrResults   = lRegParameter.exec(decodeURIComponent(pUrl));
    return lStrResults === null ?
           "" : decodeURIComponent(lStrResults[1].replace(/\+/g, "%20"));
  }//}}}

  /**
   * When purged tabs, return the url for reloading tab.
   *
   * @param {string} pUrl - the url of the tab.
   * @return {Promise} return the promise object.
   *                   When be resolved, return the url for to purge.
   */
  function getPurgeURL(pUrl)//{{{
  {
    console.info('getPurgeURL', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'string' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    let str_args = '&url=' + encodeURIComponent(pUrl).replace(/%20/g, '+');
    return encodeURI(gStrBlankUrl) + '?' + encodeURIComponent(str_args);
  }//}}}

  /**
   * check run auto purge or not.
   * @return {Promise} return an promise object.
   */
  function autoPurgeCheck()//{{{
  {
    console.info('purgeCheck() in closureAutoPurgeCheck');

    return new Promise((resolve, reject) => {
      let remaiming_memory = getOpts('remaiming_memory');

      isLackTheMemory(remaiming_memory)
      .then(result => {
        if (result === false) {
          resolve();
          return;
        }

        ticked.forEach((pValue, pKey) => {
          tick(pKey)
          .then(isLackTheMemory(remaiming_memory))
          .then(result => (result === false) ? resolve() : () => {})
          .catch(reject);
        });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  /**
   * exclusive process for function.
   *
   * @param {string} name - to add a name of Function.
   * @param {function} callback -
   *     Function that performs an exclusive processing.
   * @param {Any} [callbackArgs] - pass arguments to Function.
   * @return {promise} return promise.
   */
  let exclusiveProcessForFunc = (() => {//{{{
    console.info('create closure of exclusiveProcessForFunc');

    let locks  = new Set();

    return function() {
      console.info('exclusiveProcessForFunc',
        Array.prototype.slice.call(arguments));

      let args          = Array.prototype.slice.call(arguments);
      let name          = "";
      let callback      = null;
      let callback_args = [];
      let err_msg       = '';

      return new Promise((resolve, reject) => {
        err_msg = checkFunctionArguments(args, [
          [ 'string' ],
          [ 'function' ],
          [ ],
        ], true);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        if (args.length < 2) {
          reject(
            new Error(`Number of arguments is not enough:` +
                      ` ${args.length}`));
          return;
        }

        name          = args[0];
        callback      = args[1];
        callback_args = args.length > 2 ? args.slice(2) : void 0;

        if (locks.has(name)) {
          console.warn(`Already running process of: ${name}`);
          resolve();
          return;
        }

        locks.add(name);
        callback.apply(null, callback_args)
        .then(() => {
          console.log(`exclusiveProcess has resolve: ${name}`);
          locks.delete(name);
          resolve();
        })
        .catch(e => {
          console.log(`exclusiveProcess has reject: ${name}`);
          locks.delete(name);
          reject(e);
        });
      });
    };
  })();

  /**
   * redirectPurgedTabWhenCreateNewTab
   *
   * @param {object} pDetails -
   *     A object to get from a function of webRequest.
   * @return {object} return object for webRequest.
   */
  function redirectPurgedTabWhenCreateNewTab(pDetails)//{{{
  {
    console.info('redirectPurgedTabWhenCreateNewTab',
                 Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'object' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    if (pDetails.type === 'main_frame') {
      let tab_id = pDetails.tabId;
      let url    = pDetails.url;

      if (create_tab_ids.has(tab_id)) {
        create_tab_ids.delete(tab_id);

        if (checkExcludeList(url) & NORMAL) {
          if (unloaded_observe.has(tab_id)) {
            throw new Error(
              "TabId has already existed into unloaded_observe: " +
              `${JSON.stringify(pDetails)}`);
          }

          chrome.tabs.get(tab_id, tab => {
            setUnloaded(tab_id, url, tab.windowId);
          });

          return { redirectUrl: getPurgeURL(url) };
        }
      }
    }
    return {};
  }//}}}

  function loadScrollPosition(pTabId)//{{{
  {
    console.info('loadScrollPosition', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      if (tmp_scroll_pos.has(pTabId)) {
        let lNumPos = tmp_scroll_pos.get(pTabId);

        chrome.tabs.executeScript(
          pTabId, { code: `scroll(${lNumPos.x}, ${lNumPos.y});` }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            tmp_scroll_pos.delete(pTabId);
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  }//}}}

  function purgingAllTabsExceptForTheActiveTab()//{{{
  {
    console.info('purgingAllTabsExceptForTheActiveTab');

    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, pTabs => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        let not_release_pages = pTabs.filter(v => !isReleasePage(v.url));
        let already_purged   = pTabs.length - not_release_pages.length;
        let max_opening_tabs = getOpts('max_opening_tabs');
        let max_purge_length = pTabs.length - already_purged - max_opening_tabs;
        if (max_purge_length <= 0) {
          console.log("The counts of open tabs are within set value.");
          resolve();
          return;
        }

        not_release_pages = not_release_pages.filter(
          v => !v.active && (checkExcludeList(v.url) & NORMAL) !== 0);

        let promise_results = [];
        for (let i = 0;
             i < not_release_pages.length && i < max_purge_length;
             ++i) {
          promise_results.push( tick(not_release_pages[i].id) );
        }

        Promise.all(promise_results)
          .then(resolve)
          .catch(reject);
      });
    });
  }//}}}

  /**
   * This function will check memory capacity.
   * If the memory is shortage, return true.
   *
   * @param {number} pCriteriaMemorySize - criteria memory size(MByte).
   * @return {promise} promiseが返る。
   */
  function isLackTheMemory(pCriteriaMemorySize)//{{{
  {
    console.info('isLackTheMemory', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      chrome.system.memory.getInfo(info => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        let ratio = info.availableCapacity / Math.pow(1024.0, 2);
        console.log('availableCapacity(MByte):', ratio);
        resolve(ratio < parseFloat(pCriteriaMemorySize));
      });
    });
  }//}}}

  function initializeIntervalProcess()//{{{
  {
    return new Promise((resolve, reject) => {
      intervalProcess(getOpts('interval_timing'))
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  // These processes are If you called at normal function,
  // May called multiple times at the same time.
  // Therefore, the callback function of setInterval is called.
  function intervalProcess(pIntervalTime)//{{{
  {
    console.info('initializeIntervalProcess',
      Array.prototype.slice.call(arguments));

    let args          = Array.prototype.slice.call(arguments);
    let interval_name = 'main';

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      let interval_id = continue_run.get(interval_name);
      // TODO: must fix || to &&
      if (interval_id !== void 0 || interval_id !== null) {
        console.warn(
          "Already running interval process, so its process is stop." +
          `Then create new interval process. ` +
          `interval_name: ${interval_name}`);

        clearInterval(interval_id);
        continue_run.delete(interval_name);
      }

      interval_id = setInterval(() => {//{{{
        console.log('run callback funciton of setInterval.');
        if (db === void 0 || db === null) {
          reject(new Error('IndexedDB is not initialized yet.'));
          return;
        }

        if (unloaded_change) {
          unloaded_change = false;

          // If this function was called the observe function of unloaded,
          // When user close multiple tabs, continuously call more than once.
          // Thus, the same session is added more than once.
          // So call at here.
          exclusiveProcessForFunc('writeSession', writeSession)
          .catch(e => console.error(e));
        }

        if (!disable_auto_purge) {
          if (getOpts('purging_all_tabs_except_active') === true) {
            exclusiveProcessForFunc(
              'purgingAllTabs', purgingAllTabsExceptForTheActiveTab)
            .catch(e => console.error(e));
          }

          if (getOpts('enable_auto_purge') === true) {
            exclusiveProcessForFunc('autoPurgeCheck', autoPurgeCheck)
            .catch(e => console.error(e));
          }
        }
      }, pIntervalTime * 1000);//}}}

      continue_run.set(interval_name, interval_id);

      resolve();
    });
  }//}}}
  
  function deleteOldDatabase()//{{{
  {
    console.info('deleteOldDatabase');

    return new Promise((resolve, reject) => {
      let promise_results = [];
      promise_results.push( deleteOldSession() );
      promise_results.push( deleteOldHistory() );

      Promise.all(promise_results)
        .then(deleteNotUsePageInfo)
        .then(deleteNotUseDataURI)
        .then(resolve)
        .catch(reject);
    });
  }//}}}

  function deleteOldSession()//{{{
  {
    console.info('deleteOldSession');

    return new Promise((resolve, reject) => {
      db.getAll({
        name: gStrDbSessionName,
      })
      .then(histories => {
        let max_sessions = parseInt(getOpts('max_sessions'), 10);

        let date = new Set();
        histories.forEach(pValue => {
          date.add(pValue.date);
        });

        return (date.size < max_sessions) ?
                null :
                Array.from(date).slice(0, date.size - max_sessions);
      })
      .then(rArrayDateList => {
        if (rArrayDateList === null || rArrayDateList.length === 0) {
          return;
        }

        let db_range = (rArrayDateList.length === 1) ?
                IDBKeyRange.only(rArrayDateList[0]) :
                IDBKeyRange.bound(
                  rArrayDateList[0], rArrayDateList[rArrayDateList.length - 1]);
        return db.getCursor({
          name:      gStrDbSessionName,
          range:     db_range,
          indexName: 'date',
        })
        .then(sessions => {
          let delete_keys = sessions.map(v => v.id);
          return db.delete({ name: gStrDbSessionName, keys: delete_keys });
        });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function deleteOldHistory()//{{{
  {
    console.info('deleteOldHistory');

    return new Promise((resolve, reject) => {
      let max_history = parseInt(getOpts('max_history'), 10);
      let now         = new Date();
      db.getCursor({
        name: gStrDbHistoryName,
        range: IDBKeyRange.upperBound(
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - max_history,
            23, 59, 59, 999).getTime()
        ),
      })
      .then(histories => {
        let delete_keys = histories.map(v => v.date);
        return db.delete({ name: gStrDbHistoryName, keys: delete_keys });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function deleteNotUsePageInfo()//{{{
  {
    console.info('deleteNotUsePageInfo');

    function check(pArray, pObjTarget)//{{{
    {
      let args  = Array.prototype.slice.call(arguments);

      return new Promise((resolve3, reject3) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'array' ],
          [ 'object' ],
        ]);
        if (err_msg) {
          reject3(new Error(err_msg));
          return;
        }

        let result = pArray.some(v => (v.url === pObjTarget.url));
        if (result) {
          reject3();
        } else {
          resolve3();
        }
      });
    }//}}}
    
    return new Promise((resolve, reject) => {
      let promise_results = [];
      promise_results.push( db.getAll({ name: gStrDbPageInfoName     } ) );
      promise_results.push( db.getAll({ name: gStrDbHistoryName      } ) );
      promise_results.push( db.getAll({ name: gStrDbSessionName      } ) );
      promise_results.push( db.getAll({ name: gStrDbSavedSessionName } ) );

      Promise.all(promise_results)
      .then(results => {
        return new Promise((resolve2, reject2) => {
          let page_infos     = results[0];
          let histories      = results[1];
          let sessions       = results[2];
          let saved_sessions = results[3];

          promise_results = [];
          page_infos.forEach(pValue => {
            promise_results.push(
              new Promise(resolve3 => {
                let promise_results2 = [];
                promise_results2.push( check(histories, pValue) );
                promise_results2.push( check(sessions, pValue) );
                promise_results2.push( check(saved_sessions, pValue) );
                Promise.all(promise_results2).then(
                  () => resolve3(pValue.url),
                  () => resolve3(null)
                );
              })
            );
          });

          Promise.all(promise_results).then(results2 => {
            let delete_keys = results2.filter(v => (v !== null));
            return db.delete({ name: gStrDbPageInfoName, keys: delete_keys });
          })
          .then(resolve2)
          .catch(reject2);
        });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function deleteNotUseDataURI()//{{{
  {
    console.info('deleteNotUseDataURI');

    return new Promise((resolve, reject) => {
      let promise_results = [];
      promise_results.push( db.getAll({ name: gStrDbDataURIName } ) );
      promise_results.push( db.getAll({ name: gStrDbPageInfoName } ) );

      Promise.all(promise_results)
      .then(results => {
        let data_uris  = results[0];
        let page_infos = results[1];

        promise_results = [];
        data_uris.forEach(pValue => {
          promise_results.push(
            new Promise(resolve3 => {
              let result = page_infos.some(v2 => (v2.host === pValue.host));
              resolve3(result ? null : pValue.host);
            })
          );
        });

        return Promise.all(promise_results).then(results2 => {
          let delete_keys = results2.filter(v => (v !== null));
          return db.delete({ name: gStrDbDataURIName, keys: delete_keys });
        });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function writeSession()//{{{
  {
    console.info('writeSession', Array.prototype.slice.call(arguments));

    return new Promise((resolve, reject) => {
      let now_time       = new Date().getTime();
      let session_writes = [];

      // current_session_timeの処理
      (() => {
        return new Promise((resolve2, reject2) => {
          if (current_session_time) {
            // previous current session is delete.
            db.getCursor({
              name:      gStrDbSessionName,
              range:     IDBKeyRange.only(current_session_time),
              indexName: 'date',
            })
            .then(histories => {
              let delete_keys = histories.map(v => v.id);
              return db.delete(
                { name: gStrDbSessionName, keys: delete_keys });
            })
            .then(resolve2)
            .catch(reject2);
          } else {
            resolve2();
          }
        });
      })()
      .then(() => {
        session_writes = [];
        unloaded_observe.forEach(obj_value => {
          if (obj_value !== void 0 && obj_value !== null &&
              obj_value.url !== void 0 && obj_value.url !== null &&
              obj_value.url.length > 0) {
            session_writes.push({
              date:     now_time,
              url:      obj_value.url,
              windowId: obj_value.windowId
            });
          } else {
            console.error("Doesn't find url.", obj_value);
          }
        });

        return db.add({ name: gStrDbSessionName, data: session_writes });
      })
      .then(() => {
        return new Promise((resolve2, reject2) => {
          if (session_writes.length > 0) {
            current_session_time = now_time;

            updatePreviousSessionTime(now_time)
            .then(resolve2)
            .catch(reject2);
          } else {
            current_session_time = 0;

            deletePreviousSessionTime()
            .then(resolve2)
            .catch(reject2);
          }
        });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  let writeHistory = (function() {//{{{
    console.info('create closure of writeHistory');

    let writes = new Set();

    return function(pTab) {
      console.info('writeHistory', Array.prototype.slice.call(arguments));

      let unknown_title = 'Unknown';
      let args          = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'object' ],
        ]);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        let tab_url = pTab.url;

        if (writes.has(tab_url)) {
          console.warn(
            'Be running to write the same URL of a history to Database already.'
          );
          resolve();
          return;
        }
        writes.add(tab_url);

        let now   = new Date();
        let year  = now.getFullYear();
        let month = now.getMonth();
        let day   = now.getDate();
        let begin = new Date(year, month, day, 0, 0, 0, 0);

        db.getCursor({
          name:  gStrDbHistoryName,
          range: IDBKeyRange.lowerBound(begin.getTime()),
        })
        .then(histories => {
          let delete_keys = histories
                              .filter(v => (v.url === tab_url))
                              .map(v => v.date);
          return db.delete({ name: gStrDbHistoryName, keys: delete_keys });
        })
        .then(() => {
          return db.add({
            name: gStrDbHistoryName,
            data: {
              date: now.getTime(),
              url:  tab_url,
            },
          });
        })
        .then(() => {
          return new Promise((resolve, reject) => {
            if (getOpts('get_title_when_does_not_title') === true &&
                !pTab.title) {
              ajax({ url:tab_url, responseType: 'document' })
              .then(pObjResult => {
                if (pObjResult.status === 200) {
                  resolve(pObjResult.response.title || unknown_title);
                } else {
                  reject(new Error("Doesn't get title with ajax."));
                }
              })
              .then(resolve)
              .catch(reject);
            } else {
              resolve(pTab.title || unknown_title);
              return;
            }
          });
        })
        .then(pStrTitle => {
          let tab_title = pStrTitle;
          let uri       = getSplitURI(tab_url);

          let promise_results = [];

          // pageInfo
          promise_results.push(
            db.add({
              name: gStrDbPageInfoName,
              data: {
                url:   tab_url,
                title: tab_title,
                host:  uri.hostname,
              },
            })
          );
          // dataURI.
          promise_results.push(
            new Promise(resolve3 => {
              let favicon_url = pTab.favIconUrl ||
                `${uri.scheme}://${uri.hostname}/favicon.ico`;

              getDataURI(favicon_url)
              .then(dataURI => {
                return db.add({
                  name: gStrDbDataURIName,
                  data: {
                    host:    uri.hostname,
                    dataURI: dataURI,
                  }
                });
              })
              .then(resolve3)
              .catch(pErr => {
                console.warn(pErr);
                console.warn("Don't find favIconUrl.", pTab);
                resolve3();
              });
            })
          );
          // If Promise was error, it is transaction error.
          // When its error was shown, to occur in the key already exist.
          // Therefore, I call the resolve function.
          return new Promise(resolve => {
            Promise.all(promise_results).then(resolve).catch(resolve);
          });
        })
        .then(() => writes.delete(tab_url))
        .then(resolve)
        .catch(reject);
      });
    };
  })();//}}}

  function deleteAllPurgedTabUrlFromHistory()//{{{
  {
    console.info('deleteAllPurgedTabUrlFromHistory');

    let regex_blank_url = new RegExp(`^${gStrBlankUrl}`, 'i');

    return new Promise((resolve, reject) => {
      chrome.history.search({ text: '' }, histories => {
        let delete_urls = new Set();
        histories.forEach(pValue => {
          let url = pValue.url;
          if (regex_blank_url.test(url)) {
            delete_urls.add(url);
          }
        });

        let promise_results = [];
        delete_urls.forEach(pValue => {
          promise_results.push(new Promise(
            resolve => chrome.history.deleteUrl({ url: pValue }, resolve)));
        });

        Promise.all(promise_results).then(resolve).catch(reject);
      });
    });
  }//}}}

  /**
   * return the current tab object.
   *
   * @return {Promise} return promise object.
   *                   If run the reject function, return Error object.
   *                   If run the resolve function,
   *                   return the object of the current tab.
   */
  function getCurrentTab()//{{{
  {
    console.info('getCurrentTab');

    return new Promise((resolve, reject) => {
      chrome.tabs.query(
        { windowId: chrome.windows.WINDOW_ID_CURRENT, active: true }, pTabs => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(pTabs[0]);
      });
    });
  }//}}}

  /**
   * check If the url has contained the release pages.
   *
   * @param {String} pUrl - the target url.
   * @return {Boolean} If the url is contained, return true.
   *                   if the different, return false.
   */
  function isReleasePage(pUrl)//{{{
  {
    console.info('isReleasePage', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'string' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    return pUrl.indexOf(gStrBlankUrl) === 0;
  }//}}}

  /**
   * isPlayingSound
   *
   * Whether it is playing sound that given the tab.
   *
   * @param {Object} pTab - The tab object of chrome.tabs.
   * @return {Boolean} If the tab have been playing sound, True.
   *     haven't playing sound if False.
   */
  function isPlayingSound(pTab)//{{{
  {
    console.info('isPlayingSound', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'object' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    return pTab.audible === true;
  }//}}}

  /**
  * Check whether the user matches that set the exclusion list.
  * @param {String} pUrl - the url to check whether matches.
  * @param {Object} pExclude - the object represent exclusion list settings.
  *     list    - 除外リストの値。複数のものは\nで区切る.
  *     options - 正規表現のオプション.
  *     returnValue - 一致したときに返す返り値
  * @return {Number} 引数にはnullかreturnValueの値が入る
  */
  function checkMatchUrlString(pUrl, pExclude)//{{{
  {
    console.info('checkMatchUrlString', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'string' ],
      [ 'object' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    let excludes = pExclude.list.split('\n');
    for (let i = 0; i < excludes.length; ++i) {
      if (excludes[i].length !== 0) {
        let regex_url = new RegExp(excludes[i].trim(), pExclude.options);
        if (regex_url.test(pUrl)) {
          return pExclude.returnValue;
        }
      }
    }

    return null;
  }//}}}

  /**
   * return the exclusion list have been set argument,
   *
   * @param {String} pTarget - the name of the target list.
   *                   If the value is undefined, return normal exlusion list.
   * @return {Object} the object of the list relation.
   */
  function getTargetExcludeList(pTarget)//{{{
  {
    console.info('getTargetExcludeList', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'undefined', 'null', 'string' ],
    ], true);
    if (err_msg) {
      throw new Error(err_msg);
    }

    switch (pTarget) {
      case 'chrome':
        return {
          list:        gStrChromeExcludeUrl,
          options:     'i',
          returnValue: CHROME_EXCLUDE,
        };
      case 'extension':
        return {
          list:        gStrExtensionExcludeUrl,
          options:     'i',
          returnValue: EXTENSION_EXCLUDE,
        };
      case 'temp':
        return {
          list:        Array.from(temp_release).join('\n'),
          options:     'i',
          returnValue: TEMP_EXCLUDE,
        };
      case 'keybind':
        return {
          list:       getOpts('keybind_exclude_url'),
          options:    getOpts('keybind_regex_insensitive') ? 'i' : '',
          returnValue: KEYBIND_EXCLUDE,
        };
      default:
        return {
          list:        getOpts('exclude_url'),
          options:     getOpts('regex_insensitive') ? 'i' : '',
          returnValue: USE_EXCLUDE,
        };
    }
  }//}}}

  /**
  * 与えられたURLが全ての除外リストに一致するか検索する。
  * @param {String} pUrl - 対象のURL.
  * @return {Value} If be ran resolve function, return value is following.
  *               CHROME_EXCLUDE = chrome関係の除外リストと一致
  *               EXTENSION_EXCLUDE = 拡張機能関係のアドレスと一致
  *               USE_EXCLUDE    = ユーザー指定の除外アドレスと一致
  *               TEMP_EXCLUDE   = 一時的な非解放リストと一致
  *               KEYBIND_EXCLUDE = キーバインドの除外リストと一致
  *               NORMAL = 一致しなかった。
  *             And if match the exclusion list of key bindings,
  *             make a bit addition of KEYBIND_EXCLUDE.
  *
  *             When you compare these values, you should use bit addition.
  */
  function checkExcludeList(pUrl)//{{{
  {
    console.info('checkExcludeList', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'string', 'null', 'undefined' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    if (pUrl === void 0 || pUrl === null || pUrl.length === 0) {
      return INVALID_EXCLUDE;
    }

    // Check the keybind exclude list.
    let result_keybind =
      checkMatchUrlString(pUrl, getTargetExcludeList('keybind')) || 0;

    // Check the exclude list for the extension.
    let result_list = checkMatchUrlString(
      pUrl, getTargetExcludeList('extension'));
    if (result_list) {
      return result_list | result_keybind;
    }

    // Check the exclude list for Google Chrome.
    result_list = checkMatchUrlString(pUrl, getTargetExcludeList('chrome'));
    if (result_list) {
      return result_list | result_keybind;
    }

    // Check to the temporary exclude list.
    result_list = checkMatchUrlString(pUrl, getTargetExcludeList('temp'));
    if (result_list) {
      return result_list | result_keybind;
    }

    // Check the normal exclude list.
    result_list = checkMatchUrlString(pUrl, getTargetExcludeList());
    if (result_list) {
      return result_list | result_keybind;
    }

    // don't match the exclude lists.
    return NORMAL | result_keybind;
  }//}}}

  function reloadBrowserIconInAllActiveTab()//{{{
  {
    console.info('reloadBrowserIconInAllActiveTab');

    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true }, pTabs => {
        pTabs.forEach(pTab => {
          // TODO: This is not loop.
          reloadBrowserIcon(pTab)
          .then(resolve)
          .catch(reject);
        });
      });
    });
  }//}}}

  /**
   * 指定したタブの状態に合わせ、ブラウザアクションのアイコンを変更する。
   * @param {object} pTab 対象のタブ.
   * @param {Promise} promiseが返る。
   */
  function reloadBrowserIcon(pTab)//{{{
  {
    console.info('reloadBrowserIcon', Array.prototype.slice.call(arguments));

    let args     = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'object' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      let change_icon = disable_auto_purge ?
                        DISABLE_AUTOPURGE :
                        checkExcludeList(pTab.url);
      chrome.browserAction.setIcon(
        { path: gMapIcons.get(change_icon), tabId: pTab.id }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          icon_states.set(pTab.id, change_icon);

          let title = 'Tab Memory Purge\n';
          if (change_icon & DISABLE_AUTOPURGE) {
            title += "The automatic purge of the all tabs has stopped.";
          } else if (change_icon & NORMAL) {
            title += "The url of this tab isn't include exclude list.";
          } else if (change_icon & USE_EXCLUDE) {
            title += "The url of this tab is included your exclude list.";
          } else if (change_icon & TEMP_EXCLUDE) {
            title += "The url of this tab is included" +
                         " your temporary exclude list.";
          } else if (change_icon & EXTENSION_EXCLUDE) {
            title += "The url of this tab is included" +
                         " exclude list of in this extension.";
          } else if (change_icon & CHROME_EXCLUDE) {
            title += "The url of this tab is included" +
                         " exclude list for Google Chrome.";
          } else {
            reject(new Error(`Invalid state. ${change_icon}`));
            return;
          }

          if (change_icon & KEYBIND_EXCLUDE) {
            title += "\nAnd also included in the exclude list of key bindings.";
          }

          chrome.browserAction.setTitle({ tabId: pTab.id, title: title });
          resolve(change_icon);
        }
      );
    });
  }//}}}

  /**
  * タブの解放を行います。
  * @param {Number} pTabId タブのID.
  * @param {Promise} promiseが返る。
  */
  function purge(pTabId)//{{{
  {
    console.info('purge', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      let tab              = {};
      let scroll_positions = [];

      if (unloaded_observe.has(pTabId)) {
        reject(new Error(`Already purging. ${pTabId}`));
        return;
      }

      let promise_results = [];
      promise_results.push(
        new Promise((resolve2, reject2) => {
          chrome.tabs.get(pTabId, rTab => {
            if (chrome.runtime.lastError) {
              reject2(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve2(rTab);
          });
        })
      );

      promise_results.push(
        new Promise((resolve2, reject2) => {
          chrome.tabs.executeScript(
            pTabId, { file: gStrGetScrollPosScript }, rScrollPosition => {
              if (chrome.runtime.lastError) {
                reject2(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve2(rScrollPosition);
            }
          );
        })
      );

      Promise.all(promise_results)
      .then(rResults => {
        tab              = rResults[0];
        scroll_positions = rResults[1];

        if (tab.status !== 'complete') {
          console.warn("The target tab has not been completed loading yet: " +
                       `${JSON.stringify(tab)}`);
          resolve();
          return;
        }

        let state = checkExcludeList(tab.url);
        if (state & (CHROME_EXCLUDE | EXTENSION_EXCLUDE)) {
          reject(new Error(
            'The tabId have been included the exclusion list' +
            ` of extension and chrome: ${pTabId}`));
          return;
        } else if (state & INVALID_EXCLUDE) {
          reject(new Error(`Don't get the url of the tab: ${pTabId}`));
          return;
        }

        return Promise.resolve();
      })
      .then(() => {
        return new Promise(resolve2 => {
          chrome.tabs.sendMessage(pTabId, { event: 'form_cache' }, resolve2);
        });
      })
      .then(() => {
        return new Promise((resolve2, reject2) => {
          let url = getPurgeURL(tab.url);

          chrome.tabs.executeScript(pTabId, {
            code: `window.location.replace("${url}");` }, () => {
              if (chrome.runtime.lastError) {
                reject2(chrome.runtime.lastError);
                return;
              }
              resolve2();
            }
          );
        });
      })
      .then(() => {
        setUnloaded(pTabId, tab.url, tab.windowId, scroll_positions[0]);

        return exclusiveProcessForFunc(
          'deleteAllPurgedTabUrlFromHistory',
          deleteAllPurgedTabUrlFromHistory);
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  /**
  * 解放したタブを復元します。
  * @param {Number} pId 復元するタブのID.
  * @return {Promise} promiseが返る。
  */
  function unPurge(pId)//{{{
  {
    console.info('unPurge', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      chrome.tabs.sendMessage(pId,
        { event: 'location_replace' }, useChrome => {
          // If the url is empty in purge page.
          if (useChrome) {
            let url = unloaded_observe.get(pId).url;
            chrome.tabs.update(pId, { url: url }, resolve);
          } else {
            resolve();
          }
        }
      );
    });
  }//}}}

  /**
  * 定期的に実行される関数。アンロードするかどうかを判断。
  * @param {Number} pTabId 処理を行うタブのID.
  * @return {Promise} Promiseが返る。
  */
  function tick(pTabId)//{{{
  {
    console.info('tick', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      if (unloaded_observe.has(pTabId)) {
        deleteTick(pTabId);
        reject(new Error(
          `pTabId added to unloaded_observe already: ${pTabId}`));
        return;
      }

      chrome.tabs.get(pTabId, rTab => {
        if (chrome.runtime.lastError) {
          deleteTick(pTabId);
          reject(new Error(`tick function is skipped: ${pTabId}. message: ` +
                 chrome.runtime.lastError.message));
          return;
        }

        // 全ての除外アドレス一覧と解放用のページと比較
        let state = checkExcludeList(rTab.url);
        if (!(state & NORMAL) && !isReleasePage(rTab.url)) {
          // 除外アドレスに含まれている場合
          console.warn("the tab includes to the exclusion list: " +
                       ` ${JSON.stringify(rTab)}`);
          resolve();
          return;
        }

        if (getOpts('not_purge_playsound_tab') === true &&
            isPlayingSound(rTab)) {
          console.warn(
            `the tab have been playing sound: ${JSON.stringify(rTab)}`);
          resolve();
          return;
        }

        // If a tab is activated, updates unload time of a tab.
        (() => rTab.active ? setTick(pTabId) : purge(pTabId))()
        .then(resolve).catch(reject);
      });
    });
  }//}}}

  /**
  * 定期的な処理を停止
  * @param {Number} pId 停止するタブのID.
  */
  function deleteTick(pId)//{{{
  {
    console.info('deleteTick', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'number' ],
    ]);
    if (err_msg) {
      throw new Error(err_msg);
    }

    if (ticked.has(pId)) {
      clearInterval(ticked.get(pId));
      ticked.delete(pId);
    }
  }//}}}

  /**
  * 定期的に解放処理の判断が行われるよう設定します。
  * 既に設定済みなら時間を延長します。
  * @param {Number} pTabId 設定するタブのID.
  * @return {Promise} Promiseが返る。
  */
  function setTick(pTabId)//{{{
  {
    console.info('setTick', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      if (disable_auto_purge) {
        console.log("Extension is disabled automatic purge.");
        resolve();
        return;
      }

      // 分(設定) * 秒数 * ミリ秒
      let timer = parseInt(getOpts('timer'), 10) * 60 * 1000;

      // Update.
      deleteTick(pTabId);
      let interval_id = setInterval(() => tick(pTabId), timer);
      ticked.set(pTabId, interval_id);

      resolve();
    });
  }//}}}

  function updateAllTickIntervalOfTabs()//{{{
  {
    console.info('unloadedAllTickIntervalOfTabs');

    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, pTabs => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        pTabs.forEach(pValue => setTick(pValue.id));

        resolve();
      });
    });
  }//}}}

  /**
  * 指定した辞書型の再帰処理し、タブを復元する。
  * 引数は第一引数のみを指定。
  *
  * @param {array of object} pSessions
  *     You want to restore the array of sessions.
  * @return {Promise} promiseが返る。
  */
  let restore = (function() {//{{{
    console.info('create closure of restore.');

    function restoreTab(pSession)//{{{
    {
      console.info('restoreTab in closure of restore.',
        Array.prototype.slice.call(arguments));

      let args  = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'object' ],
        ]);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        let win_id  = pSession.windowId;
        let url     = pSession.url;
        let opts    = { url: getPurgeURL(url), active: false };

        if (win_id) {
          opts.windowId = win_id;
        }

        chrome.tabs.create(opts, rTab => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            let results = new Map();
            results.set(rTab.id, {
              url            : url,
              windowId       : rTab.windowId,
              scrollPosition : { x : 0 , y : 0 },
            });
            resolve(results);
          }
        );
      });
    }//}}}

    function restoreWindow(pSessions)//{{{
    {
      console.info('restoreWindow in closure of restore.',
        Array.prototype.slice.call(arguments));

      let args = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'array' ],
        ]);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        let temp_urls = new Map();
        let urls      = [];
        pSessions.forEach(v => {
          let url = getPurgeURL(v.url);
          temp_urls.set(url, v.url);
          urls.push(url);
        });

        chrome.windows.create({ url: urls }, win => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          let results = new Map();
          win.tabs.forEach(pValue => {
            results.set(pValue.id, {
              url            : temp_urls.get(pValue.url),
              windowId       : pValue.windowId,
              scrollPosition : { x : 0 , y : 0 },
            });
          });
          resolve(results);
        });
      });
    }//}}}

    function restoreSessionsInCurrentOrOriginal(//{{{
      pWinId, pSessions, pRestoreType)
    {
      console.info('restoreSessionsInCurrentOrOriginal in closure of restore.',
        Array.prototype.slice.call(arguments));

      let args = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'number', 'undefined', 'null' ],
          [ 'array' ],
          [ 'string' ],
        ]);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        // restore tab to window of winId.
        let promise_results = [];
        pSessions.forEach(pValue => {
          if (pRestoreType === 'restore_to_original_window') {
            pValue.windowId = pWinId;
          } else {
            delete pValue.windowId;
          }
          promise_results.push( restoreTab(pValue) );
        });

        Promise.all(promise_results).then(pResults => {
          let results = new Map();
          pResults.forEach(pValue => {
            pValue.forEach((pValueJ, pKeyJ) => {
              results.set(pKeyJ, pValueJ);
            });
          });
          return results;
        })
        .then(resolve)
        .catch(reject);
      });
    }//}}}

    function restoreSessions(pWinId, pSessions, pRestoreType)//{{{
    {
      console.info('restoreSessions in closure if restore',
        Array.prototype.slice.call(arguments));

      let args = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'number', 'null', 'undefined' ],
          [ 'array' ],
          [ 'string' ],
        ]);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        switch (pRestoreType) {
        case 'restore_to_current_window':
          restoreSessionsInCurrentOrOriginal.apply(null, args)
            .then(resolve)
            .catch(reject);
          break;
        case 'restore_to_original_window':
          (() => {
            return new Promise((resolve, reject) => {
              if (pWinId) {
                chrome.tabs.query({ windowId: pWinId }, pTabs => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                  }
                  resolve(pTabs.length !== 0);
                });
              } else {
                resolve(false);
              }
            });
          })()
          .then(isWin => {
            if (isWin) {
              return restoreSessionsInCurrentOrOriginal.apply(null, args);
            } else {
              // create window. therefore, to restore.
              return restoreWindow(pSessions);
            }
          })
          .then(resolve)
          .catch(reject);
          break;
        case 'restore_to_new_window':
          restoreWindow(pSessions)
            .then(resolve)
            .catch(reject);
          break;
        default:
          reject(new Error("pRestoreType is invalid."));
          return;
        }
      });
    }//}}}

    return function(pSessions, pRestoreType) {//{{{
      console.info('restore', Array.prototype.slice.call(arguments));

      let args = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'array' ],
          [ 'null', 'undefined', 'string' ],
        ], true);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        if (pRestoreType === void 0 || pRestoreType === null) {
          pRestoreType = getOpts('restored_type');
        }

        let each_windows = new Map();
        pSessions.forEach(pValue => {
          let win_id = pValue.windowId;
          let lists  = each_windows.get(win_id) || [];
          lists.push(pValue);
          each_windows.set(win_id, lists);
        });

        let promise_results = [];
        each_windows.forEach((pValue, pKey) => {
          promise_results.push(restoreSessions(pKey, pValue, pRestoreType));
        });

        Promise.all(promise_results)
        .then(rResults => {
          rResults.forEach(pValue => {
            pValue.forEach((pValueJ, pTabId) => {
              if (!unloaded_observe.has(pTabId)) {
                unloaded_observe.set(pTabId, pValueJ);
              } else {
                console.error(
                  'same tabId is found in unloaded_observe object.', pTabId);
              }
            });
          });
        })
        .then(resolve)
        .catch(reject);
      });
    };//}}}
  })();//}}}

  function switchTempRelease(pUrl, pType)//{{{
  {
    console.info('switchTempRelease', Array.prototype.slice.call(arguments));

    let err_msg = checkFunctionArguments(arguments, [
      [ 'string' ],
      [ 'string', 'undefined', 'null' ],
    ], true);
    if (err_msg) {
      throw new Error(err_msg);
    }

    let url_for_regex     = escapeForRegExp(pUrl);
    let regex_url_in_args = new RegExp(url_for_regex);
    let delete_keys       = [];
    temp_release.forEach(pValue => {
      if (regex_url_in_args.test( decodeForRegExp(pValue) )) {
        delete_keys.push(pValue);
      }
    });

    delete_keys.forEach(pValue => temp_release.delete(pValue));

    if ((delete_keys.length === 0 &&
         toType(pType) !== 'string') ||
         pType === 'add') {
      temp_release.add(url_for_regex);
    }
  }//}}}

  /**
  * 指定されたタブに最も近い未解放のタブをアクティブにする。
  * 右側から探索され、見つからなかったら左側を探索する。
  * 何も見つからなければ新規タブを作成してそのタブをアクティブにする。
  * @param {object} pTab 基準点となるタブ.
  * @return {Promise} promiseが返る。
  */
  function searchUnloadedTabNearPosition(pTab)//{{{
  {
    console.info('searchUnloadedTabNearPosition',
      Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        function(pValue) {
          return toType(pValue) !== 'object' &&
                 !pValue.hasOwnProperty('index') &&
                 !pValue.hasOwnProperty('windowId');
        },
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      // 現在のタブの左右の未解放のタブを選択する
      chrome.tabs.query({ windowId: pTab.windowId }, pTabs => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        let tabs = pTabs.filter(v =>
          !unloaded_observe.has(v.id) && !isReleasePage(v.url));
        let active_tab = tabs.find(v => (pTab.index < v.index));
        if (active_tab === void 0 || active_tab === null) {
          active_tab = tabs.reverse().find(v => (pTab.index > v.index));
        }

        if (active_tab === void 0 || active_tab === null) {
          // If can not find the tab to activate to create a new tab.
          chrome.tabs.create({ active: true }, resolve);
        } else {
          // If found tab, It's active.
          chrome.tabs.update(active_tab.id, { active: true }, resolve);
        }
      });
    });
  }//}}}

  /**
   * 拡張機能がインストールされたときの処理
   */
  function onInstall()//{{{
  {
    console.info('Extension Installed.');

    return new Promise(resolve => {
      chrome.runtime.openOptionsPage(resolve);
    });
  }//}}}

  function restoreSessionBeforeUpdate(pPreviousSessionTime)//{{{
  {
    console.info('restoreSessionBeforeUpdate',
      Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ], true);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      db.getCursor({
        name:      gStrDbSessionName,
        range:     IDBKeyRange.only(pPreviousSessionTime),
        indexName: 'date',
      })
      .then(sessions => {
        if (sessions.length === 0) {
          return;
        }

        let restore_sessions = [];
        sessions.forEach(pValue => {
          restore_sessions.push(
            { url: pValue.url, windowId: pValue.windowId });
        });

        if (restore_sessions.length > 0) {
          return restore(restore_sessions);
        }
        return;
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  /**
   * 拡張機能がアップデートされたときの処理
   */
  function onUpdate()//{{{
  {
    console.info('Extension Updated.');

    return new Promise((resolve, reject) => {
      getInitAndLoadOptions()
      .then(pOptions => {
        if (pOptions.get(gStrPreviousSessionTimeKey)) {
          return showDialogOfRestoreSessionBeforeUpdate();
        } else {
          return;
        }
      })
      .then(() => {
        return new Promise((resolve2, reject2) => {
          chrome.tabs.create({
            url: `${gStrOptionPage}?page=change_history`,
            active: true
          }, () => {
            if (chrome.runtime.lastError) {
              reject2(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve2();
          });
        });
      })
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  /**
   * 拡張機能のバージョンを返す
   * @return {String} 拡張機能のバージョン.
   */
  function getVersion()//{{{
  {
    console.info('getVersion');
    let lObjDetails= chrome.app.getDetails();
    return lObjDetails.version;
  }//}}}

  function versionCheckAndUpdate()//{{{
  {
    console.info('versionCheckUpdate');

    return new Promise((resolve, reject) => {
      let current_version = getVersion();
      chrome.storage.local.get(gStrVersionKey, pStorages => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        let run_func = null;
        let previous_version = pStorages[gStrVersionKey];
        if (current_version === void 0 || current_version === null) {
          run_func = onInstall;
        } else if (current_version !== previous_version) {
          run_func = onUpdate;
        } else {
          resolve();
          return;
        }

        (() => {
          return new Promise(resolve => {
            let write = {};
            write[gStrVersionKey] = current_version;
            chrome.storage.local.set(write, resolve);
          });
        })()
        .then(run_func)
        .then(resolve)
        .catch(reject);
      });
    });
  }//}}}

  function updatePreviousSessionTime(pTime)//{{{
  {
    console.info('updatePreviousSessionTime',
      Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      let write = {};
      write[gStrPreviousSessionTimeKey] = pTime;
      chrome.storage.local.set(write, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }//}}}

  function deletePreviousSessionTime()//{{{
  {
    console.info('deletePreviousSessionTime');

    return new Promise((resolve, reject) => {
      // delete old current session time.
      chrome.storage.local.remove(gStrPreviousSessionTimeKey, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }//}}}

  /**
   * getInitAndLoadOptions
   * Load my options in chrome.storage.
   * And If an item doesn't contain to default values, it is deleted.
   * And those are deleted too from chrome.storage.
   *
   * @return {Promise} return promise.
   *                   If returned reject, return a error message.
   *                   If returned resolve, return getting my options.
   */
  function getInitAndLoadOptions()//{{{
  {
    console.info('getInitAndLoadOptions');

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(pItems => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        // All remove invalid options. but exclude version.
        let remove_keys = [];
        Object.keys(pItems).forEach(pStrKey => {
          if (!gMapDefaultValues.has(pStrKey)) {
            remove_keys.push(pStrKey);
            delete pItems[pStrKey];
          }
        });

        chrome.storage.local.remove(remove_keys, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          // My options are initialized.
          let options = new Map();
          Object.keys(pItems).forEach(v => options.set(v, pItems[v]));
          gMapDefaultValues.forEach((pValue, pStrKey) => {
            if (!options.has(pStrKey)) {
              options.set(pStrKey, pValue);
            }
          });

          resolve(options);
        });
      });
    });
  }//}}}

  function initializeUseOptions(pOptions)//{{{
  {
    console.info('initializeUseOptions', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'map' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      ext_opts = pOptions;

      // initialize badge.
      chrome.browserAction.setBadgeText(
        { text: unloaded_observe.size().toString() });
      chrome.browserAction.setBadgeBackgroundColor({ color: '#0066FF' });

      resolve();
    });
  }//}}}

  let initializeAlreadyPurgedTabs = (function() {//{{{
    console.info('create closure of initializeAlreadyPurgedTabs.');

    function toAdd(pCurrent)
    {
      let args = Array.prototype.slice.call(arguments);

      return new Promise((resolve, reject) => {
        let err_msg = checkFunctionArguments(args, [
          [ 'object' ],
        ]);
        if (err_msg) {
          reject(new Error(err_msg));
          return;
        }

        let result_value = checkExcludeList(pCurrent.url);
        if (result_value ^ (NORMAL & INVALID_EXCLUDE)) {
          if (isReleasePage(pCurrent.url)) {
            setUnloaded(
              pCurrent.id,
              getParameterByName(pCurrent.url, 'url'),
              pCurrent.windowId);
          }

          setTick(pCurrent.id).then(resolve).catch(reject);
        } else {
          resolve();
        }
      });
    }

    return function() {
      console.info('initializeAlreadyPurgedTabs');

      return new Promise((resolve, reject) => {
        chrome.tabs.query({}, pTabs => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          // If already purging tab, be adding the object of purging tab.
          let promise_results = [];
          pTabs.forEach(pValue => {
            promise_results.push( toAdd(pValue) );
          });

          Promise.all(promise_results).then(resolve).catch(reject);
        });
      });
    };
  })();//}}}

  let initializeDatabase = (function() {//{{{
    function dbOpen()
    {
      // db is global. but only in script.
      db = new Database(gStrDbName, gNumDbVersion);
      return db.open(gObjDbCreateStores);
    }

    return function() {
      return new Promise((resolve, reject) => {
        if (db === void 0 || db === null) {
          dbOpen()
          .then(resolve)
          .catch(reject);
        } else {
          db.close()
          .then(dbOpen)
          .then(resolve)
          .catch(reject);
        }
      });
    };
  })();//}}}

  /**
   * be initializing.
   */
  function initialize()//{{{
  {
    initializeDatabase()
    .then(versionCheckAndUpdate)
    .then(getInitAndLoadOptions)
    .then(initializeUseOptions)
    .then(initializeAlreadyPurgedTabs)
    .then(initializeIntervalProcess)
    .then(initializeIntervalUpdateCheck(gNumUpdateCheckTime))
    .then(deleteOldDatabase)
    .then(deleteAllPurgedTabUrlFromHistory)
    .catch(e => console.error(e || 'initialize error.'));
  }//}}}

  let switchDisableTimerState = (function() {//{{{
    console.info('create closure of switchDisableTimerState');

    return function() {
      console.info('switchDisableTimerState');

      return new Promise((resolve, reject) => {
        if (disable_auto_purge) {
          updateAllTickIntervalOfTabs()
          .then(() => {
            disable_auto_purge = false;
          })
          .then(resolve)
          .catch(reject);
        } else {
          ticked.forEach(pValue => clearInterval(pValue));
          ticked.clear();

          disable_auto_purge = true;
          resolve();
        }
      });
    };
  })();//}}}

  /**
   * onActivatedFunc
   *
   * @param {number} pTabId the id of the tab.
   * @return {Promise} promiseが返る。
   */
  function onActivatedFunc(pTabId)//{{{
  {
    console.info('onActivatedFunc', Array.prototype.slice.call(arguments));

    let args = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      chrome.tabs.get(pTabId, pTab => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        // 前にアクティブにされていたタブのアンロード時間を更新
        if (old_active_ids.has(pTab.WindowId)) {
          setTick(old_active_ids.get(pTab.windowId));
        }
        old_active_ids.set(pTab.windowId, pTabId);

        // アイコンの状態を変更
        reloadBrowserIcon(pTab).then(resolve).catch(reject);
      });
    });
  }//}}}

  function updateOptionValues()//{{{
  {
    console.info('updateOptionValues');

    return new Promise((resolve, reject) => {
      getInitAndLoadOptions()
      .then(pOptions => {
        ext_opts = pOptions;
      })
      .then(updateAllTickIntervalOfTabs)
      .then(initializeIntervalProcess)
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function updateCheck()//{{{
  {
    console.info('updateCheck');

    return new Promise(resolve => {
      chrome.runtime.requestUpdateCheck((pStatus, pVersion) => {
        switch (pStatus) {
        case 'update_available':
          console.log('update is avaliable now.');
          resolve(pVersion);
          return;
        case 'no_update':
          console.log('no update found.');
          break;
        case 'throttled':
          console.log('Has been occurring many request update checks. ' +
                      'You need to back off the updating request.');
          break;
        }

        resolve(null);
      });
    });
  }//}}}

  function initializeIntervalUpdateCheck(pCheckTime)//{{{
  {
    console.info('initializeIntervalUpdateCheck',
      Array.prototype.slice.call(arguments));

    let interval_name = 'updateCheck';
    let args          = Array.prototype.slice.call(arguments);

    return new Promise((resolve, reject) => {
      let err_msg = checkFunctionArguments(args, [
        [ 'number' ],
      ]);
      if (err_msg) {
        reject(new Error(err_msg));
        return;
      }

      let interval_id = continue_run.get(interval_name);
      if (interval_id !== void 0 && interval_id !== null) {
        console.warn('already be running the update check process, ' +
                     "so it's stop, and restart.");
        clearInterval(interval_id);
        continue_run.delete(interval_name);
      }

      interval_id = setInterval(updateCheck, pCheckTime);
      continue_run.set('updateCheck', interval_id);
      resolve();
    });
  }//}}}

  function showDialogOfRestoreSessionBeforeUpdate() {//{{{
    return new Promise(resolve => {
      chrome.notifications.create(
        RESTORE_PREVIOUS_SESSION,
        {
          type:    'basic',
          title:   'Restore the session before update.',
          message: 'Do want to restore the session before update?',
          iconUrl: gMapIcons.get(EXTENSION_ICON_128),
          buttons: [
            { title: 'Restore' },
            { title: 'No' },
          ],
        },
        pResult => {
          beep();
          resolve(pResult);
        }
      );
    });
  }//}}}

  function showUpdateConfirmationDialog() {//{{{
    return new Promise(resolve => {
      chrome.notifications.create(
        UPDATE_CONFIRM_DIALOG,
        {
          type:    'basic',
          title:   'Update is available.',
          message: 'New version is available now.',
          iconUrl: gMapIcons.get(EXTENSION_ICON_128),
          buttons: [
            { title: 'Update' },
            { title: 'Later' },
          ],
        },
        pResult => {
          beep();
          resolve(pResult);
        }
      );
    });
  }//}}}

  chrome.webRequest.onBeforeRequest.addListener(pDetails => {//{{{
    // console.info('webRequest.onBeforeRequest', pDetails);

    if (getOpts('new_tab_opens_with_purged_tab') === true) {
      if (current_tab_id !== pDetails.tabId) {
        return redirectPurgedTabWhenCreateNewTab(pDetails);
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]);//}}}

  chrome.tabs.onActivated.addListener(pObjActiveInfo => {//{{{
    console.info('chrome.tabs.onActivated.', pObjActiveInfo);

    current_tab_id = pObjActiveInfo.tabId;
    if (unloaded_observe.has(pObjActiveInfo.tabId) &&
        getOpts('no_release') === false) {
        unPurge(pObjActiveInfo.tabId)
          .then(onActivatedFunc(pObjActiveInfo.tabId))
          .catch(e => console.error(e));
    } else {
      onActivatedFunc(pObjActiveInfo.tabId)
        .catch(e => console.error(e));
    }
  });//}}}

  chrome.tabs.onCreated.addListener(pTab => {//{{{
    console.info('chrome.tabs.onCreated.', pTab);

    create_tab_ids.add(pTab.id);
    setTick(pTab.id).catch(e => console.error(e));
  });//}}}

  chrome.tabs.onRemoved.addListener(pTabId => {//{{{
    console.info('chrome.tabs.onRemoved.', pTabId);

    unloaded_observe.delete(pTabId);
    deleteTick(pTabId);
    icon_states.delete(pTabId);
  });//}}}

  chrome.tabs.onAttached.addListener(pTabId => {//{{{
    console.info('chrome.tabs.onAttached.', pTabId);

    setTick(pTabId).catch(e => console.error(e));
  });//}}}

  chrome.tabs.onDetached.addListener(pTabId => {//{{{
    console.info('chrome.tabs.onDetached.', pTabId);

    unloaded_observe.delete(pTabId);
    deleteTick(pTabId);
    icon_states.delete(pTabId);
  });//}}}

  chrome.tabs.onUpdated.addListener((pTabId, pChangeInfo, pTab) => {//{{{
    if (pChangeInfo.status === 'loading') {
      console.info('chrome.tabs.onUpdated. loading.',
                   Array.prototype.slice.call(arguments));

      if (!isReleasePage(pTab.url) && unloaded_observe.has(pTabId)) {
        unloaded_observe.delete(pTabId);
      }
    } else {
      console.info('chrome.tabs.onUpdated. complete.',
                   Array.prototype.slice.call(arguments));

      loadScrollPosition(pTabId)
        .then(reloadBrowserIcon(pTab))
        .catch(e => console.error(e));
    }
  });//}}}

  chrome.windows.onRemoved.addListener(pWindowId => {//{{{
    console.info('chrome.windows.onRemoved.', pWindowId);
    old_active_ids.delete(pWindowId);
  });//}}}

  chrome.runtime.onMessage.addListener(//{{{
    (pMessage, pSender, pSendResponse) => {
      console.info('chrome.runtime.onMessage.',
                   Array.prototype.slice.call(arguments));

      let promise_results = [];
      let state           = 0;

      switch (pMessage.event) {
        case 'initialize':
          initialize();
          break;
        case 'release':
          // toggle purged tab.
          getCurrentTab()
          .then(pTab => {
            if (unloaded_observe.has(pTab.id)) {
              return unPurge(pTab.id);
            } else {
              return purge(pTab.id)
                     .then(searchUnloadedTabNearPosition(pTab));
            }
          })
          .catch(e => console.error(e));
          break;
        case 'switch_not_release':
        case 'switch_not_release_host':
          getCurrentTab()
          .then(pTab => {
            let add_url = (pMessage.event === 'switch_not_release_host' ||
                          pMessage.addType === 'host') ?
                          getSplitURI(pTab.url).hostname :
                          pTab.url;
            switchTempRelease(add_url, pMessage.type);

            return setTick(pTab.id);
          })
          .then(reloadBrowserIconInAllActiveTab)
          .catch(e => console.error(e));
          break;
        case 'all_purge':
        case 'all_purge_without_exclude_list':
          chrome.tabs.query({}, pArrayResults => {
            if (chrome.runtime.lastError) {
              console.error(new Error(chrome.runtime.lastError.message));
              return;
            }

            let targets = pArrayResults.filter(v => {
              state       = checkExcludeList(v.url);
              let result_state = (pMessage.event === 'all_purge') ?
                ~(CHROME_EXCLUDE | EXTENSION_EXCLUDE | INVALID_EXCLUDE) &
                   state : NORMAL & state;
               return !unloaded_observe.has(v.id) &&
                      result_state !== 0;
            });
            if (targets.length === 0) {
              return;
            }

            promise_results = [];
            targets.forEach(v => promise_results.push( purge(v.id) ));

            Promise.all(promise_results)
            .then(getCurrentTab)
            .then(searchUnloadedTabNearPosition)
            .catch(e => console.error(e));
          });
          break;
        case 'all_unpurge':
          // 解放されている全てのタブを解放解除
          unloaded_observe.forEach((pStrValue, pStrKey) => {
            unPurge(parseInt(pStrKey, 10)).catch(e => console.error(e));
          });
          break;
        case 'switch_timer_state':
          switchDisableTimerState()
          .then(reloadBrowserIconInAllActiveTab)
          .catch(e => console.error(e));
          break;
        case 'add_current_tab_exclude_list':
          getCurrentTab()
          .then(pTab => {
            return new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(
                pTab.id, { event: 'getExcludeDialogState' }, pBoolState => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                  }
                  resolve([pTab, pBoolState]);
                });
            });
          })
          .then(pArrayItem => {
            return new Promise((resolve, reject) => {
              let lObjTab     = pArrayItem[0];
              let lBoolState  = pArrayItem[1];
              let lStrMessage = '';

              lStrMessage = (lBoolState === true) ? 'hide' : 'show';
              lStrMessage += 'ExcludeDialog';

              chrome.tabs.sendMessage(
                lObjTab.id, { event: lStrMessage }, () => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                  }
                  resolve();
                });
            });
          })
          .catch(e => console.error(e));
          break;
        case 'add_to_temp_exclude_list':
          getCurrentTab()
          .then(pTab => {
            switchTempRelease(pMessage.url, 'add');
            return setTick(pTab.id);
          })
          .then(reloadBrowserIconInAllActiveTab)
          .catch(e => console.error(e));
          break;
        case 'clear_temporary_exclusion_list':
          temp_release.clear();
          reloadBrowserIconInAllActiveTab();
          break;
        case 'reload_option_value':
          updateOptionValues()
          .then(reloadBrowserIconInAllActiveTab)
          .catch(e => console.error(e));
          break;
        case 'load_options_and_reload_current_tab':
          promise_results = [];
          promise_results.push( getCurrentTab() );
          promise_results.push( updateOptionValues() );
          Promise.all(promise_results).then(pArrayResults => {
            return setTick(pArrayResults[0].id);
          })
          .then(reloadBrowserIconInAllActiveTab)
          .catch(e => console.error(e));
          break;
        case 'restore':
          restore(pMessage.session)
          .then(() => console.log('restore is completed.'))
          .catch(e => console.error(e));
          break;
        case 'check_purged_tab':
          {
            let tab_id = pSender.tab.id;
            if (!unloaded_observe.has(tab_id)) {
              chrome.tabs.get(tab_id, pTab => {
                setUnloaded(tab_id, pMessage.url, pTab.windowId);
                pSendResponse(false);
              });
            } else {
              pSendResponse(true);
            }
          }
          break;
        case 'get_icon_state':
          pSendResponse(icon_states.get(pMessage.tabId));
          break;
        case 'keybind_check_exclude_list':
          state = checkExcludeList(pMessage.location.href);
          pSendResponse(!(state &
            (CHROME_EXCLUDE | EXTENSION_EXCLUDE |
             KEYBIND_EXCLUDE | INVALID_EXCLUDE)));
          break;
      }
    }
  );//}}}

  chrome.runtime.onUpdateAvailable.addListener(pDetails => {//{{{
    console.info("runtime.onUpdateAvailable", pDetails);
    showUpdateConfirmationDialog()
    .catch(e => console.error(e));
  });//}}}

  chrome.notifications.onButtonClicked.addListener(//{{{
    (pNotificationId, pButtonIndex) => {
      console.info('nortifications.onButtonClicked',
                   Array.prototype.slice.call(arguments));
      (() => {
        return new Promise((resolve, reject) => {
          chrome.notifications.clear(pNotificationId, pWasCleared => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (pWasCleared) {
              resolve();
            } else {
              reject(new Error(`Doesn't clear: ${UPDATE_CONFIRM_DIALOG}`));
            }
          });
        });
      })()
      .then(() => {
        return new Promise((resolve, reject) => {
          switch (pNotificationId) {
          case UPDATE_CONFIRM_DIALOG:
            if (pButtonIndex === 0) {
              writeSession()
                // reload the extension, and update the extension.
                .then(() => chrome.runtime.reload())
                .then(resolve)
                .catch(reject);
            } else {
              resolve();
            }
            break;
          case RESTORE_PREVIOUS_SESSION:
            if (pButtonIndex === 0) {
              getInitAndLoadOptions()
                .then(pOptions => {
                  return restoreSessionBeforeUpdate(
                    pOptions.get(gStrPreviousSessionTimeKey));
                })
                .then(deletePreviousSessionTime)
                .then(resolve)
                .catch(reject);
            } else {
              deletePreviousSessionTime()
                .then(resolve)
                .catch(reject);
            }
            break;
          }
        });
      })
      .catch(e => console.error(e));
    }
  );//}}}

  initialize();
})();
