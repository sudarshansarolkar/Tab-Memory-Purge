﻿(function(window, document) {
  'use strict';

  //{{{ variables
  var defaultMenu = "normal";

  var db = null; // indexedDB

  var classNameOfCopyButton  = 'copy';
  var classNameOfApplyButton = 'apply';

  var keybindClassNameOfSetButton   = 'keybind_set';
  var keybindClassNameOfClearButton = 'keybind_clear';
  var selectorKeybindOption         = '.keyOption';
  var selectorShowingKeybind        = '.pressKey';
  var selectorKeybindValue          = '.keybindValue';

  var menuSelector           = '.sectionMenu';
  var buttonSelector         = '.sectionButton';
  var sectionButtonClassName = buttonSelector.substring(1);

  var classNameWhenSelect     = 'select';
  var elementDoesNotClassName = 'doNotShow';
  var prototypeClassName      = 'prototype';

  var selectorHistoryDate                       = '.historyDate';
  var selectorHistoryItem                       = '.historyItem';
  var selectorOfLocationWhereAddHistoryDateItem = '#history .historyList';
  var selectorOfLocationWhereAddItem            = '.historyItemList';
  var selectorDateTitle                         = '.historyDateTitle';
  var selectorDateDelete                        = '.historyDateDelete';
  var selectorHistoryItemDelete                 = '.historyItemDelete';
  var selectorHistoryItemDate                   = '.historyItemDate';
  var selectorHistoryItemUrl                   = '.historyItemUrl';
  var selectorHistoryItemIcon                   = '.historyItemIcon';
  var selectorHistoryItemTitle                  = '.historyItemTitle';
  var selectorSearchHistoryDate                 = '#searchHistoryDate';
  var selectorSearchHistoryItem                 = '#searchHistoryItem';
  var selectorSearchHistoryDateList             = '#historyDateList';
  var prototypeSelectorOfHistoryDate =
    selectorHistoryDate + '.' + prototypeClassName;
  var prototypeSelectorOfHistoryItem =
    selectorHistoryItem + '.' + prototypeClassName;

  var selectorDateListNav                     = '.dateListNav';
  var selectorAddSavedSessionDateListLocation = '#savedSessionDateList';
  var addSavedSessionDateListIdName =
    selectorAddSavedSessionDateListLocation.slice(1);
  var selectorAddSessionDateListLocation = '#sessionDateList';
  var selectorAddSessionListLocation     = '#sessionList';
  var selectorSavedSessionHistory        = '.savedSessionHistory';
  var selectorSessionHistory             = '.sessionHistory';
  var selectorDateList                   = '#dateList';
  var selectorSessionTitle               = '#sessionTitle';
  var selectorSessionSave                = '#sessionSave';
  var selectorSessionDelete              = '#sessionDelete';
  var selectorSessionRestore             = '#sessionRestore';
  var selectorSessionItem                = '.sessionItem';
  var selectorSessionItemDelete          = '.sessionItemDelete';
  var selectorSessionItemUrl             = '.sessionItemUrl';
  var selectorSessionItemIcon            = '.sessionItemIcon';
  var selectorSessionItemTitle           = '.sessionItemTitle';
  var attrNameOfSessionItemId            = 'sessionItemId';

  var prototypeSelectorOfSessionItem =
    selectorSessionItem + '.' + prototypeClassName;

  var selectorExportLocation = '#export';
  var selectorImportLocation = '#import';

  var excludeKeyNames = [];
  excludeKeyNames.push(versionKey);
  excludeKeyNames.push(previousSessionTimeKey);
//}}}

  var OperateOptionValue = function() {//{{{
  };
  OperateOptionValue.prototype.get = function(d, name) {
    return this.call(d, name, null, 'get');
  };
  OperateOptionValue.prototype.set = function(d, name, value) {
    return this.call(d, name, value, 'set');
  };
  OperateOptionValue.prototype.call = function(d, name, value, type) {
    return new Promise((resolve, reject) => {
      if (type === void 0 || type === null) {
        type = 'get';
      }

      var el = d.querySelector(
        "input[name='" + name + "'], textarea[name='" + name + "']");
      if (el) {
        try {
          switch (el.type) {
          case 'number':
            if (type === 'get') {
              resolve(parseInt(el.value));
            } else {
              if (toType(value) !== 'number') { throw new Error(); }

              el.value = value;
              resolve();
            }
            break;
          case 'checkbox':
            if (type === 'get') {
              if (toType(el.checked) !== 'boolean') { throw new Error(); }

              resolve(el.checked);
            } else {
              if (toType(value) !== 'boolean') { throw new Error(); }

              el.checked = value;
              resolve();
            }
            break;
          case 'text':
          case 'textarea':
            if (type === 'get') {
              if (toType(el.value) !== 'string') { throw new Error(); }

              resolve(el.value);
            } else {
              if (toType(value) !== 'string') { throw new Error(); }

              el.value = value.trim();
              resolve();
            }
            break;
          default:
            reject(new Error("Doesn't write the code of each element type." +
              "name: [ " + name + " ], type : [ " + el.type + " ]"));
            break;
          }
          return;
        } catch (e) {
          reject(new Error("Value [ " + value + " ] is not [ " +
                 el.type + " ] type. name: " + name));
          return;
        }
      }
      console.warn("Doesn't find the elememt name: " + name);
      resolve();
    });
  };
  OperateOptionValue.prototype.init = function(d) {
    return this.load(d, defaultValues);
  };
  OperateOptionValue.prototype.load = function(d, loadOptions) {
    var $this = this;

    return new Promise((resolve, reject) => {
      $this.export()
      .then(options => {
        if (toType(loadOptions) === 'object' && loadOptions) {
          options = loadOptions;
        }

        var p = [];
        for (var key in options) {
          if (options.hasOwnProperty(key)) {
            p.push($this.set(d, key, options[key]));
          }
        }

        Promise.all(p).then(resolve, reject);
      })
      .catch(reject);
    });
  };
  OperateOptionValue.prototype.export = function() {
    return new Promise(resolve => {
      chrome.storage.local.get(items => {
        var r = {};
        for (var key in defaultValues) {
          if (defaultValues.hasOwnProperty(key)) {
            r[key] = items.hasOwnProperty(key) ?
                     items[key] : defaultValues[key];
          }
        }
        resolve(r);
      });
    });
  };
  OperateOptionValue.prototype.import = function(d, importOptions) {
    var $this = this;
    return new Promise((resolve, reject) => {
      $this.load(d, importOptions)
      .then(() => resolve(importOptions))
      .catch(reject);
    });
  };
  //}}}

  var ShowMenuSelection = function(selectors, className_when_select) {//{{{
    ShowMenuSelection.toggleSectionRegex = /(display:\s*)(\w+);/i;

    this.menuSelector          = selectors.menu;
    this.buttonSelector        = selectors.button;
    this.className_when_select = className_when_select;
  };
  ShowMenuSelection.prototype.showMenu = function(selector) {
    return function(idName) {
      var oldStyle, newStyle;
      var showMenu = document.querySelector(selector + '#' + idName + '');

      var el    = showMenu;
      var style = el.getAttribute('style');
      if (style === null) {
        el.setAttribute('style', 'display: block;');
      } else {
        oldStyle = style.replace(ShowMenuSelection.toggleSectionRegex, '');
        newStyle = 'display: block;';
        el.setAttribute('style', oldStyle + newStyle);
      }

      var dontShowMenu =
        document.querySelectorAll(selector + ':not(#' + idName + ')');
      var i = 0;
      while (i < dontShowMenu.length) {
        el = dontShowMenu[i];
        style = el.getAttribute('style');
        if (style === null) {
          el.setAttribute('style', 'display: none;');
        } else {
          oldStyle = style.replace(ShowMenuSelection.toggleSectionRegex, '');
          newStyle = 'display: none;';
          el.setAttribute('style', oldStyle + newStyle);
        }

        ++i;
      }
    };
  };
  ShowMenuSelection.prototype.changeSelectionButtonColor = function(selector) {
    var $this = this;

    return function(name) {
      var o = document.querySelector(
        selector + '.' + $this.className_when_select);
      if (o !== null) {
        o.setAttribute('class',
          o.getAttribute('class').replace(
            $this.className_when_select, '').trim() );
      }

      var n = document.querySelector(selector + '[name = "' + name + '"]');
      n.setAttribute('class',
        n.getAttribute('class') + ' ' + $this.className_when_select);
    };
  };
  ShowMenuSelection.prototype.show = function(name) {
    var $this = this;

    return new Promise((resolve) => {
      var showMenuArea, selectMenuButton;

      showMenuArea     = $this.showMenu($this.menuSelector);
      selectMenuButton = $this.changeSelectionButtonColor($this.buttonSelector);

      showMenuArea(name);
      selectMenuButton(name);

      resolve(name);
    });
  };//}}}

  var KeyTrace = function(id) {//{{{
    this.id = id || null;
    this.result = null;
  };
  KeyTrace.prototype.start = function(id) {
    if (id === null || id === void 0) {
      throw new Error("Doesn't set the id of arguments.");
    }

    this.id = id;
  };
  KeyTrace.prototype.traceEvent = function(event) {
    if (this.id === null || this.id === void 0) {
      throw new Error("Doesn't set the id in this instance yet.");
    }

    this.result = { id: this.id, key: keyCheck(event) };
    this.stop();

    return this.result;
  };
  KeyTrace.prototype.stop = function() {
    this.id = null;
  };
  KeyTrace.prototype.clear = function() {
    this.id = null;
    this.result = null;
  };
  KeyTrace.prototype.isRun = function() {
    return this.id !== void 0 && this.id !== null;
  };
  KeyTrace.prototype.getResult = function() {
    return this.result;
  };//}}}

  function WhenVersionUpOptionFix()//{{{
  {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(items => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        var writeObject = {};
        var keybind = items.keybind;
        if (keybind) {
          for (var key in keybind) {
            if (keybind.hasOwnProperty(key)) {
              writeObject['keybind_' + key] = keybind[key];
            }
          }
        }

        chrome.storage.local.set(writeObject, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          chrome.storage.local.remove('keybind', () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve();
          });
        });
      });
    });
  }//}}}

  function processAfterMenuSelection()//{{{
  {
    console.log('processAfterMenuSelection');

    return function(name) {
      return new Promise((resolve, reject) => {
        switch (name) {
        case 'normal':
          break;
        case 'keybind':
          showAllKeybindString();
          break;
        case 'information':
          break;
        case 'history':
          if (db.isOpened()) {
            showAllHistory().catch(e => console.error(e));
          } else {
            setTimeout(
              () => showAllHistory().catch(e => console.error(e)), 1000);
          }
          break;
        case 'session_history':
          if (db.isOpened()) {
            showAllSessionHistory().catch(e => console.error(e));
          } else {
            setTimeout(
              () => showAllSessionHistory().catch(e => console.error(e)), 1000);
          }
          break;
        case 'change_history':
          break;
        case 'operate_settings':
          showOptionValuesToOperateSettingsPage()
          .catch(e => console.error(e));
          break;
        default:
          reject(new Error("The Invalid menu name."));
          return;
        }
        history.pushState(name,
          document.title + ' ' + chrome.i18n.getMessage(name),
          optionPage + '?page=' + name);
        resolve(name);
      });
    };
  }//}}}

  window.addEventListener('popstate', e => {//{{{
    if (e.state) {
      menuToggle.show(e.state || defaultMenu);
    }
  }, true);//}}}

  //{{{ A variable of a function of using closure.
  var operateOption = new OperateOptionValue();
  var keybindTrace  = new KeyTrace();
  var menuToggle    = new ShowMenuSelection(
    { menu: menuSelector, button: buttonSelector }, classNameWhenSelect);
  var afterMenuSelection = processAfterMenuSelection();
  //}}}

  function deleteKeyItemFromObject(obj, deleteKeys)//{{{
  {
    if (toType(obj) !== 'object' || toType(deleteKeys) !== 'array') {
      throw new Error('Invalid arguments.');
    }

    var newObj = obj;
    var i = 0;
    while (i < deleteKeys.length) {
      delete newObj[ deleteKeys[i] ];
      ++i;
    }

    return newObj;
  }//}}}

  function showOptionValuesToOperateSettingsPage()//{{{
  {
    return new Promise(resolve => {
      operateOption.export()
      .then(options => {
        var newOptions = deleteKeyItemFromObject(options, excludeKeyNames);
        var e = document.querySelector(selectorExportLocation);
        e.value = JSON.stringify(newOptions, null, '    ');
        resolve();
      });
    });
  }//}}}

  function hasStringOfAttributeOfElement(element, attrName, addStr)//{{{
  {
    var re = new RegExp('(^|\\s+)' + addStr, '');
    return re.test(element.getAttribute(attrName));
  }//}}}

  function addStringToAttributeOfElement(element, attrName, addStr)//{{{
  {
    if (!hasStringOfAttributeOfElement(element, attrName, addStr)) {
      var oldAttribute = element.getAttribute(attrName);
      element.setAttribute(
        attrName, (oldAttribute ? oldAttribute + ' ' : '') + addStr);
      return true;
    }
    return false;
  }//}}}

  function removeStringFromAttributeOfElement(//{{{
    element, attrName, removeStr, replaceStr)
  {
    var re = new RegExp('(^|\\s+)' + removeStr, 'ig');
    var value = element.getAttribute(attrName);
    if (value) {
      element.setAttribute(attrName, value.replace(re, replaceStr || ''));
    }
  }//}}}

  function removeHistoryDate(event)//{{{
  {
    return new Promise((resolve, reject) => {
      var date = new Date(parseInt(event.target.getAttribute('name'), 10));
      var begin = new Date(
        date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      var end = new Date(
        date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      db.getCursor({
        name: dbHistoryName,
        range: IDBKeyRange.bound(begin.getTime(), end.getTime()),
      })
      .then(histories => {
        var delKeys = histories.map(v => v.date);
        return db.delete({
          name: dbHistoryName,
          keys: delKeys,
        });
      })
      .then(ret => {
        return new Promise(resolve => {
          var historyDateLegend = event.target.parentNode;
          var historyDateField  = historyDateLegend.parentNode;
          var historyList       = historyDateField.parentNode;
          historyList.removeChild(historyDateField);

          resolve(ret);
        });
      })
      .then(resolve)
      .catch(e => {
        console.error(e);
        reject(e);
      });
    });
  }//}}}

  function removeHistoryItem(event)//{{{
  {
    return new Promise((resolve, reject) => {
      db.delete({
        name: dbHistoryName,
        keys: parseInt(event.target.getAttribute('name'), 10),
      })
      .then(ret => {
        return new Promise(resolve => {
          var historyItem     = event.target.parentNode;
          var historyItemList = historyItem.parentNode;
          historyItemList.removeChild(historyItem);

          resolve(ret);
        });
      })
      .then(resolve)
      .catch(e => {
        console.error(e);
        reject(e);
      });
    });
  }//}}}

  function getPrototypeAndRemoveTag(selector) {//{{{
    var proto = document.querySelector(selector).cloneNode(true);
    removeStringFromAttributeOfElement(proto, 'class', prototypeClassName);
    return proto;
  }//}}}

  function addAutocompleteDateList(selector)//{{{
  {
    var autocompleteList = document.querySelector(selector);
    var optionElement = document.createElement('option');

    while (autocompleteList.firstChild) {
      autocompleteList.removeChild(autocompleteList.firstChild);
    }

    return function(date) {
      var option = optionElement.cloneNode(true);
      option.value = formatDate(date, 'YYYY-MM-DD');
      autocompleteList.appendChild(option);
    };
  }//}}}

  function getFormatEachLanguages(time, formatString)//{{{
  {
    if (time === void 0 || time === null) {
      throw new Error('Invalid arguments is time:' + time);
    }

    if (formatString === void 0 || formatString === null) {
      formatString = {
        'ja':      'YYYY/MM/DD hh:mm:ss',
        'default': 'MM/DD/YYYY hh:mm:ss',
      };
    }

    var formatType;
    var lang = chrome.i18n.getUILanguage();
    if (formatString.hasOwnProperty(lang)) {
      formatType = formatString[lang];
    } else {
      formatType = formatString['default'];
    }
    return formatDate(new Date(time), formatType);
  }//}}}

  function createHistoryDate(prototypeSelector)//{{{
  {
    var historyDatePrototype = getPrototypeAndRemoveTag(prototypeSelector);

    return function(addData) {
      var historyDate = historyDatePrototype.cloneNode(true);
      historyDate.setAttribute('name', addData.date.getTime());

      var dateTitle = historyDate.querySelector(selectorDateTitle);
      dateTitle.textContent = getFormatEachLanguages(addData.date, {
        'ja':      'YYYY/MM/DD',
        'default': 'MM/DD/YYYY',
      });

      var dateRemove = historyDate.querySelector(selectorDateDelete);
      dateRemove.setAttribute('name', addData.date.getTime());
      dateRemove.addEventListener('click', removeHistoryDate, true);

      return historyDate;
    };
  }//}}}

  function createHistoryDateItemList(prototypeSelector)//{{{
  {
    var historyItemPrototype = getPrototypeAndRemoveTag(prototypeSelector);
    var historyItemList = document.createElement('div');

    return  {
      set: function(addItem) {
        var historyItem = historyItemPrototype.cloneNode(true);

        var itemRemove = historyItem.querySelector(selectorHistoryItemDelete);
        itemRemove.addEventListener('click', removeHistoryItem, true);
        // item.date is a number after using getTime already.
        itemRemove.setAttribute('name', addItem.date);

        var itemDate = historyItem.querySelector(selectorHistoryItemDate);
        itemDate.textContent = formatDate(new Date(addItem.date), 'hh:mm:ss');

        var itemHref = historyItem.querySelector(selectorHistoryItemUrl);
        itemHref.href = addItem.url;

        var ItemIcon = historyItem.querySelector(selectorHistoryItemIcon);
        ItemIcon.src = addItem.dataURI;

        var itemTitle = historyItem.querySelector(selectorHistoryItemTitle);
        itemTitle.textContent = addItem.title;

        historyItemList.appendChild(historyItem);
      },
      get: function() {
        return Array.prototype.slice.call(historyItemList.childNodes);
      },
    };
  }//}}}

  function saveSession()//{{{
  {
    var sessionList = document.querySelector(selectorAddSessionListLocation);
    var showList = sessionList.querySelectorAll(
      'section:not(.' + elementDoesNotClassName + ')');
    if (showList.length === 0) {
      return;
    }

    var a;
    var urls = [];
    var i = 0;
    while (i < showList.length) {
      a = showList[i].querySelector(selectorSessionItemUrl);
      urls.push(a.href);
      ++i;
    }

    var time = Date.now();
    var newSessions = urls.map(v => {
      return { date: time, url: v };
    });

    db.put({
      name: dbSavedSessionName,
      data: newSessions,
    })
    .then(showAllSessionHistory)
    .catch(e => console.error(e));
  }//}}}

  function deleteSession()//{{{
  {
    var sessionTitle = document.querySelector(selectorSessionTitle);
    var date = parseInt(sessionTitle.getAttribute('name'));
    var dbNames = [ dbSessionName, dbSavedSessionName ];

    var p = [];
    var i = 0;
    while (i < dbNames.length) {
      p.push(
        db.getCursor({
          name: dbNames[i],
          range: IDBKeyRange.only(date),
          indexName: 'date',
        })
      );
      ++i;
    }

    Promise.all(p)
    .then(results => {
      return new Promise((resolve, reject) => {
        var sessions = [];
        i = 0;
        while (i < results.length) {
          sessions = sessions.concat(results[i]);
          ++i;
        }
        var delKeys = sessions.map(v => v.id);

        var p2 = [];
        i = 0;
        while (i < dbNames.length) {
          p2.push(
            db.delete({
              name: dbNames[i],
              keys: delKeys,
            })
          );
          ++i;
        }

        Promise.all(p2).then(resolve, reject);
      });
    })
    .then(showAllSessionHistory)
    .catch(e => console.error(e));
  }//}}}

  function restoreSession()//{{{
  {
    var sessionList = document.querySelector(selectorAddSessionListLocation);
    var showList = sessionList.querySelectorAll(
      'section:not(.' + elementDoesNotClassName + ')');
    if (showList.length === 0) {
      return;
    }

    var a;
    var restore = [];
    var i = 0;
    while (i < showList.length) {
      a = showList[i].querySelector(selectorSessionItemUrl);
      restore.push({ url: a.href });
      ++i;
    }

    chrome.runtime.sendMessage({ event: 'restore', session: restore });
  }//}}}

  function deleteSessionItem(event)//{{{
  {
    var t = event.target.parentNode.parentNode.parentNode;
    var className = t.getAttribute('class');
    var dbName =
      className.indexOf(selectorSessionHistory.substr(1)) !== -1 ?
      dbSessionName :
      className.indexOf(selectorSavedSessionHistory.substr(1)) !== -1 ?
      dbSavedSessionName : null;
    var id = parseInt(event.target.getAttribute(attrNameOfSessionItemId), 10);

    db.delete({
      name: dbName,
      keys: id,
    })
    .then(showAllSessionHistory)
    .catch(e => console.error(e));
  }//}}}

  function closureCreateSessionDateList(obj)//{{{
  {
    var dateList    = obj.dateList;
    var itemList    = obj.itemList;
    var currentTime = obj.currentTime;
    if (dateList === void 0 || dateList === null) {
        throw new Error("dateList isn't found in arguments");
    }
    if (itemList === void 0 || itemList === null) {
        throw new Error("itemList isn't found in arguments");
    }
    if (currentTime !== void 0 && currentTime !== null &&
        toType(currentTime) !== 'number') {
      throw new Error('currentTime in arguments is not number.');
    }

    function getDictSplitEachSessionDate(sessions)//{{{
    {
      var data;
      var ret = {};
      var i = 0;
      while (i < sessions.length) {
        data = sessions[i];
        if (!ret.hasOwnProperty(data.date)) {
          ret[data.date] = [];
        }
        ret[data.date].push(data);
        ++i;
      }
      return ret;
    }//}}}

    function onClicked(event)//{{{
    {
      var name = event.target.getAttribute('name');

      // select which is showed a list of a session date.
      var showLists = itemList.querySelectorAll('section[name="' + name + '"]');
      var i = 0;
      while (i < showLists.length) {
        removeStringFromAttributeOfElement(
          showLists[i], 'class', elementDoesNotClassName);
        ++i;
      }

      var notShowLists =
        itemList.querySelectorAll('section:not([name="' + name + '"])');
      i = 0;
      while (i < notShowLists.length) {
        addStringToAttributeOfElement(
          notShowLists[i], 'class', elementDoesNotClassName);
        ++i;
      }

      // If clicking date is saved sesssion, add button is not show.
      var saveBtn = document.querySelector(selectorSessionSave);
      var list = event.target.parentNode;
      var listName = list.getAttribute('id');
      if (listName === addSavedSessionDateListIdName) {
        addStringToAttributeOfElement(
          saveBtn, 'class', elementDoesNotClassName);
      } else {
        removeStringFromAttributeOfElement(
          saveBtn, 'class', elementDoesNotClassName);
      }

      // a button of session date is changed by state.
      var dateList = document.querySelector(selectorDateList);
      var selectDates = dateList.querySelector('[name="' + name + '"]');
      addStringToAttributeOfElement(selectDates, 'class', classNameWhenSelect);

      var sessionTitle = document.querySelector(selectorSessionTitle);
      sessionTitle.setAttribute('name', name);
      sessionTitle.textContent = selectDates.textContent;

      var notSelectDates =
        dateList.querySelectorAll(':not([name="' + name + '"])');
      i = 0;
      while (i < notSelectDates.length) {
        removeStringFromAttributeOfElement(
          notSelectDates[i], 'class', classNameWhenSelect);
        ++i;
      }
    }//}}}

    function closureCreateSessionDate()//{{{
    {
      var ul = document.createElement('ul');
      var li = document.createElement('li');

      return {
        add: function(time) {
          var l = li.cloneNode(true);
          var text;
          if (currentTime !== void 0 && currentTime !== undefined &&
              parseInt(currentTime) === parseInt(time)) {
            text = 'Current Session';
          } else {
            text = getFormatEachLanguages(time);
          }

          l.setAttribute('name', time);
          l.textContent = text;
          l.addEventListener('click', onClicked, true);
          ul.appendChild(l);
        },
        get: function() {
          return Array.prototype.slice.call(ul.childNodes);
        },
        clear: function() {
          li = document.createElement('li');
        },
      };
    }//}}}

    var createSessionDate = closureCreateSessionDate();

    function createSessionItemList(prototypeSelector)//{{{
    {
      var listProto = getPrototypeAndRemoveTag(prototypeSelector);
      var list = document.createElement('div');

      return {
        add: function(addItem) {
          var item = listProto.cloneNode(true);
          item.setAttribute('name', addItem.date);

          var remove = item.querySelector(selectorSessionItemDelete);
          if (remove) {
            remove.addEventListener('click', deleteSessionItem, true);
            // item.date is a number after using getTime already.
            remove.setAttribute('name', addItem.date);
            remove.setAttribute(attrNameOfSessionItemId, addItem.id);
          }

          var url = item.querySelector(selectorSessionItemUrl);
          if (url) {
            url.href = addItem.url;
          }

          var icon = item.querySelector(selectorSessionItemIcon);
          if (icon) {
            icon.src = addItem.dataURI;
          }

          var title = item.querySelector(selectorSessionItemTitle);
          if (title) {
            title.textContent = addItem.title;
          }

          list.appendChild(item);
        },
        get: function() {
          return Array.prototype.slice.call(list.childNodes);
        },
        clear: function() {
          list = document.createElement('div');
        },
      };
    }//}}}

    function createSessionDateListItem(items)//{{{
    {
      var cSIL = createSessionItemList(prototypeSelectorOfSessionItem);

      cSIL.clear();
      var i = 0;
      while (i < items.length) {
        cSIL.add(items[i]);
        ++i;
      }

      return cSIL.get();
    }//}}}

    function addItemToElement(element, list)//{{{
    {
      var i = 0;
      while (i < list.length) {
        element.appendChild(list[i]);
        i++;
      }
    }//}}}

    function createSessionDateList(sessions)//{{{
    {
      var i, s, key;
      var list = [];
      var items;

      createSessionDate.clear();
      i = 0;
      while (i < sessions.length) {
        s = getDictSplitEachSessionDate(sessions[i].data);

        for (key in s) {
          if (s.hasOwnProperty(key)) {
            createSessionDate.add(parseInt(key));
            items = createSessionDateListItem(s[parseInt(key)]).reverse();
            list = list.concat(items);
          }
        }
        ++i;
      }

      addItemToElement(dateList, createSessionDate.get());
      addItemToElement(itemList, list);
    }//}}}

    return createSessionDateList;
  }//}}}

  function clearItemInElement(node)//{{{
  {
    while(node.firstChild) {
      node.removeChild(node.firstChild);
    }
    return node;
  }//}}}

  function showAllSessionHistory()//{{{
  {
    return new Promise((resolve, reject) => {
      var sessionSave = document.querySelector(selectorSessionSave);
      sessionSave.addEventListener('click', saveSession, true);
      var sessionDelete = document.querySelector(selectorSessionDelete);
      sessionDelete.addEventListener('click', deleteSession, true);
      var sessionRestore = document.querySelector(selectorSessionRestore);
      sessionRestore.addEventListener('click', restoreSession, true);

      getAllSessionHistory()
      .then(results => {
        var savedSessions = results[0];
        var sessions      = results[1];

        var savedSessionDateList =
          document.querySelector(selectorAddSavedSessionDateListLocation);
        var sessionDateList =
          document.querySelector(selectorAddSessionDateListLocation);
        var sessionList =
          document.querySelector(selectorAddSessionListLocation);
        clearItemInElement(savedSessionDateList);
        clearItemInElement(sessionDateList);
        clearItemInElement(sessionList);

        // new
        var cSSDL = closureCreateSessionDateList({
          dateList: savedSessionDateList,
          itemList: sessionList,
        });
        cSSDL(savedSessions);

        //{{{
        chrome.storage.local.get(previousSessionTimeKey, items => {
          var currentTime = items[previousSessionTimeKey];

          // new
          var cSDL = closureCreateSessionDateList({
            dateList: sessionDateList,
            itemList: sessionList,
            currentTime: currentTime,
          });
          cSDL(sessions);

          if (savedSessions.length !== 0 && sessions.length !== 0) {
            var dateListNav = document.querySelector(selectorDateListNav);
            removeStringFromAttributeOfElement(
              dateListNav, 'style', 'display: none;');
          }
          resolve();
        });
        //}}}
      })
      .catch(reject);
    });
  }//}}}

  function getAllSessionHistory()//{{{
  {
    return new Promise((resolve, reject) => {
      if (db === void 0 || db === null) {
        reject(new Error("IndexedDB doesn't initialize yet."));
        return;
      }

      var p = [];
      p.push( db.getAll({ name: dbSavedSessionName }) );
      p.push( db.getAll({ name: dbSessionName }) );
      p.push( db.getAll({ name: dbPageInfoName }) );
      p.push( db.getAll({ name: dbDataURIName }) );
      Promise.all(p)
      .then(results => {
        var savedSessions = results[0];
        var sessions      = results[1];
        var pageInfos     = results[2];
        var dataURIs      = results[3];

        var p = [];
        p.push(
          getListAfterJoinHistoryDataOnDB([savedSessions, pageInfos, dataURIs])
        );
        p.push(
          getListAfterJoinHistoryDataOnDB([sessions, pageInfos, dataURIs])
        );
        Promise.all(p)
        .then(resolve)
        .catch(reject);
      })
      .catch(reject);
    });
  }//}}}

  function showAllHistory()//{{{
  {
    return new Promise((resolve, reject) => {
      getAllHistory()
      .then(historyArray => {
        historyArray = historyArray.reverse();

        var autocompleteDateList =
          addAutocompleteDateList(selectorSearchHistoryDateList);

        var historyDateList =
          document.querySelector(selectorOfLocationWhereAddHistoryDateItem);
        while (historyDateList.firstChild) {
          historyDateList.removeChild(historyDateList.firstChild);
        }

        var historyDate =
          createHistoryDate(prototypeSelectorOfHistoryDate);
        var historyDateItemList =
          createHistoryDateItemList(prototypeSelectorOfHistoryItem);

        var hDate, historyItemList, itemList;
        var data, i, j, z;
        i = 0;
        while (i < historyArray.length) {
          data = historyArray[i];
          hDate = historyDate(data);
          autocompleteDateList(data.date);

          j = 0;
          while (j < data.data.length) {
            historyDateItemList.set(data.data[j]);
            j++;
          }
          itemList = historyDateItemList.get().reverse();

          historyItemList = hDate.querySelector(selectorOfLocationWhereAddItem);
          z = 0;
          while (z < itemList.length) {
            historyItemList.appendChild(itemList[z]);
            ++z;
          }

          historyDateList.appendChild(hDate);

          ++i;
        }

        resolve();
      })
      .catch(reject);
    });
  }//}}}

  function getAllHistory()//{{{
  {
    return new Promise((resolve, reject) => {
      if (db === void 0 || db === null) {
        reject(new Error("IndexedDB doesn't initialize yet."));
        return;
      }

      getHistoryListFromIndexedDB(db, dbHistoryName)
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function showSpecificHistoryDate(event)//{{{
  {
    var value      = event.target.value;
    var regex      = new RegExp(/(\d+)-(\d+)-(\d+)/);
    var matches, searchDate;
    if (value.length > 0) {
      matches    = value.match(regex);
      searchDate = new Date(matches[1], (matches[2] - 1) | 0, matches[3]);
    }

    var historyDateList = document.querySelectorAll(
      selectorHistoryDate + ':not(.' + prototypeClassName + ')');
    var item, date;
    var i = 0;
    while (i < historyDateList.length) {
      item = historyDateList[i];
      date = new Date(parseInt(item.name, 10));
      if (value.length === 0 || date.getTime() === searchDate.getTime()) {
        removeStringFromAttributeOfElement(
          item, 'class', elementDoesNotClassName);
      } else {
        addStringToAttributeOfElement(item, 'class', elementDoesNotClassName);
      }

      ++i;
    }
  }//}}}

  function showSpecificHistoryItem(event)//{{{
  {
    var i, j, f, count;
    var item, sec, historyItem, itemTitles;

    var regex = new RegExp(event.target.value.trim(), 'ig');
    var field = document.querySelectorAll(
      selectorHistoryDate + ':not(.' + prototypeClassName + ')');

    i = 0;
    while (i < field.length) {
      f = field[i];
      itemTitles = f.querySelectorAll(selectorHistoryItemTitle);

      count = 0;
      j = 0;
      while (j < itemTitles.length) {
        item = itemTitles[j];
        sec = item.parentNode.parentNode.parentNode;
        historyItem = sec.querySelector(selectorHistoryItemUrl);
        if (regex.test(item.textContent) || regex.test(historyItem.href)) {
          removeStringFromAttributeOfElement(
            sec, 'class', elementDoesNotClassName);
        } else {
          addStringToAttributeOfElement(sec, 'class', elementDoesNotClassName);
          count = (count + 1) | 0;
        }

        ++j;
      }

      if (count === itemTitles.length) {
        addStringToAttributeOfElement(f, 'class', elementDoesNotClassName);
      } else {
        removeStringFromAttributeOfElement(f, 'class', elementDoesNotClassName);
      }

      ++i;
    }
  }//}}}

  function initHistoryEvent(d)//{{{
  {
    return new Promise(resolve => {
      var searchDate = d.querySelector(selectorSearchHistoryDate);
      searchDate.addEventListener('change', showSpecificHistoryDate, true);

      var searchItem = d.querySelector(selectorSearchHistoryItem);
      searchItem.addEventListener('keyup', showSpecificHistoryItem, true);

      resolve();
    });
  }//}}}

  function changeMenu(name)//{{{
  {
    return new Promise((resolve, reject) => {
      menuToggle.show(name)
      .then(afterMenuSelection)
      .then(resolve)
      .catch(reject);
    });
  }//}}}

  function sectionButtonClicked(event)//{{{
  {
    var t = event.target;
    if (t.getAttribute('class') !== sectionButtonClassName) {
      return;
    }

    changeMenu(t.getAttribute('name'));
  }//}}}

  function initSectionBarEvent(d)//{{{
  {
    return new Promise((resolve, reject) => {
      try {
        var e = d.querySelectorAll(buttonSelector);
        var i = 0;
        while (i < e.length) {
          e[i].addEventListener('click', sectionButtonClicked, true);
          ++i;
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }//}}}

  function applyNewOptionToExtensionProcess()//{{{
  {
    return new Promise(resolve => {
      console.log("apply new option to this extension's process.");
      chrome.runtime.sendMessage({ event: 'reload_option_value' });
      resolve();
    });
  }//}}}

  function updateOptionValueToStorage(e)//{{{
  {
    var name = e.target.name;
    if (name === void 0 || name === null || name.length === 0) {
      return;
    }

    var writeObj = {};
    operateOption.get(document, name)
    .then(item => {
      return new Promise(resolve => {
        writeObj[name] = item;
        chrome.storage.local.set(writeObj, () => {
          console.log(
            'have wrote the data. name: ' + name + ', value: ' + item);
          resolve();
        });
      });
    })
    .then(applyNewOptionToExtensionProcess)
    .catch(mes => console.error(mes));
  }//}}}

  function initOptionElementEvent(d)//{{{
  {
    return new Promise(resolve => {
      var i, els;

      els = d.querySelectorAll("input");
      i = 0;
      while (i < els.length) {
        els[i].addEventListener('keyup', updateOptionValueToStorage, true);
        els[i].addEventListener('change', updateOptionValueToStorage, true);
        ++i;
      }

      els = d.querySelectorAll("textarea");
      i = 0;
      while (i < els.length) {
        els[i].addEventListener('keyup', updateOptionValueToStorage, true);
        ++i;
      }
      resolve();
    });
  }//}}}

  function showAllKeybindString()//{{{
  {
    console.log('showAllKeybindString');

    var options = document.querySelectorAll(selectorKeybindOption);
    var keyJson, keyString;
    var i = 0;
    while (i < options.length) {
      keyJson   = options[i].querySelector(selectorKeybindValue);
      keyString = options[i].querySelector(selectorShowingKeybind);
      try {
        if (keyJson.value === '{}' ||
            keyJson.value === null ||
            keyJson.value === void 0) {
            ++i;
            continue;
        }

        keyString.value = generateKeyString(JSON.parse(keyJson.value));
      } catch (e) {
        console.warn(e, keyJson.value);
      }

      ++i;
    }
  }//}}}

  function setKeybindOption(className, keyInfo)//{{{
  {
    var option = document.querySelector(
      '.' + className + selectorKeybindOption);

    var keybindValue = option.querySelector(selectorKeybindValue);
    keybindValue.value = JSON.stringify(keyInfo);

    var showKeybindString = option.querySelector(selectorShowingKeybind);
    try {
      showKeybindString.value = generateKeyString(keyInfo);
    } catch (e) {
      showKeybindString.value = '';
    }
  }//}}}

  function keyupEvent(event)//{{{
  {
    if (keybindTrace.isRun()) {
      var info = keybindTrace.traceEvent(event);
      setKeybindOption(info.id, info.key);

      // save the keybind with using event to storage.
      var newEvent = document.createEvent('HTMLEvents');
      newEvent.initEvent('change', false, true);
      var traceTarget = document.querySelector(
        '*[name="' + info.id + '"]' + selectorKeybindValue);
      traceTarget.dispatchEvent(newEvent);
    }
  }//}}}

  function initKeybindEvent(d)//{{{
  {
    return new Promise(resolve => {
      d.addEventListener('keyup', keyupEvent, true);
      resolve();
    });
  }//}}}

  function buttonClicked(event)//{{{
  {
    var t = event.target;

    // keybind only.
    var parentClassName = t.parentNode.getAttribute('class');
    var optionName;
    if (parentClassName) {
      optionName = parentClassName.replace(
        selectorKeybindOption.replace(/^./, ''), '').trim();
    }

    var el;
    var cName = t.getAttribute('class');
    switch (cName) {
    case keybindClassNameOfSetButton:
      if (keybindTrace.isRun()) {
        keybindTrace.stop();
      }
      keybindTrace.start(optionName);
      break;
    case keybindClassNameOfClearButton:
      setKeybindOption(optionName, {});

      // save the keybind with using event to storage.
      el = document.querySelector(
        '[name="' + optionName + '"]' + selectorKeybindValue);
      var newEvent = document.createEvent('HTMLEvents');
      newEvent.initEvent('change', false, true);
      el.dispatchEvent(newEvent);
      break;
    case classNameOfCopyButton:
      el = document.querySelector(selectorExportLocation);
      el.select();
      var result = document.execCommand('copy');
      var msg = result ? 'successed' : 'failured';
      console.log('have copied the string of import area. it is ' + msg + '.');

      window.getSelection().removeAllRanges();
      break;
    case classNameOfApplyButton:
      var value;

      el = document.querySelector(selectorImportLocation);
      try {
        value = JSON.parse(el.value.trim());
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.error("Invalid string. The string isn't json string.");
        } else {
          console.error(e);
        }
        break;
      }

      value = deleteKeyItemFromObject(value, excludeKeyNames);
      operateOption.import(document, value)
      .then(writeOptions => {
        return new Promise(
          resolve => chrome.storage.local.set(writeOptions, resolve));
      })
      .then(showOptionValuesToOperateSettingsPage)
      .catch(e => console.error(e));
      break;
    }
  }//}}}

  function initButtonEvent(d)//{{{
  {
    return new Promise(resolve => {
      var els = d.querySelectorAll('button');
      var i = 0;
      while (i < els.length) {
        els[i].addEventListener('click', buttonClicked, true);
        ++i;
      }
      resolve();
    });
  }//}}}

  document.addEventListener('DOMContentLoaded', () => {//{{{
    (() => {
      return new Promise(resolve => {
        db = new Database(dbName, dbVersion);
        db.open(dbCreateStores);
        resolve();
      });
    }())
    .then(() => {
      return new Promise((resolve, reject) => {
        var args = getQueryString(document);
        var menu = (args === void 0 ||
                    args === null ||
                    !args.hasOwnProperty('page')) ? defaultMenu : args.page;
        changeMenu(menu)
        .then(resolve)
        .catch(reject);
      });
    })
    .then(initSectionBarEvent(document))
    .then(loadTranslation(document, translationPath))
    .then(WhenVersionUpOptionFix)
    .then(operateOption.load(document))
    .then(showAllKeybindString)
    .then(initOptionElementEvent(document))
    .then(initButtonEvent(document))
    .then(initKeybindEvent(document))
    .then(initHistoryEvent(document))
    .catch(e => console.error(e));
  }, true);//}}}
}(this, this.document));
