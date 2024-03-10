'use strict';
const app = {

    //Manifest
    manifest: chrome.runtime.getManifest(),

    //Bookmark raw tree
    raw: [],

    //Bookmark counter
    counter: 0,

    //DOM
    dom: {
        wrapper:                document.querySelector('.wrapper'),
        body:                   document.getElementById('bookmarks'),
        settings:               document.querySelector('.settings'),
        help:                   document.querySelector('.help'),
        themeLink:              document.getElementById('themeLink'),
        themeSelect:            document.getElementById('theme'),
        linkEditor:             document.querySelector('.link-editor'),
        linkEditorForm:         document.getElementById('linkEditorForm'),
        linkEditorFieldId:      document.getElementById('linkEditorBookmarkId'),
        linkEditorFieldTitle:   document.getElementById('linkEditorBookmarkTitle'),
        linkEditorFieldUrl:     document.getElementById('linkEditorBookmarkUrl'),
        linkEditorCloseButton:  document.getElementById('linkEditorCloseButton'),
        linkEditorRemoveButton: document.getElementById('linkEditorRemoveButton'),
        linkEditorOpenIncognito:document.getElementById('linkEditorOpenPrivate'),
        folderEditor:           document.querySelector('.folder-editor'),
        folderEditorForm:       document.getElementById('folderEditorForm'),
        folderEditorFieldId:    document.getElementById('folderEditorFolderId'),
        folderEditorFieldTitle: document.getElementById('folderEditorFolderTitle'),
        folderEditorCloseButton:document.getElementById('folderEditorCloseButton'),
        folderEditorManagerLink:document.getElementById('folderEditorManagerLink'),
        folderEditorOpenAll:    document.getElementById('folderEditorOpenAll'),
        settingsForm:           document.getElementById('settingsForm'),
        settingsReset:          document.getElementById('settingsReset'),
        settingsClose:          document.getElementById('settingsClose'),
        controlButtons:         document.querySelectorAll('.control__item'),
        controlButtonRefresh:   document.querySelector('[data-control="refresh"]'),
        controlButtonSettings:  document.querySelector('[data-control="settings"]'),
        controlButtonHelp:      document.querySelector('[data-control="help"]'),
        searchInput:            document.getElementById('search'),
        searchCount:            document.getElementById('searchCount'),
        searchCancelButton:     document.getElementById('searchCancelButton'),
        scrollerButton:         document.getElementById('scrollerButton'),
        versionContainer:       document.getElementById('version'),
        content:                '<ul>',
        folders: function() {
            return document.querySelectorAll('.bookmarks__folder > span')
        },
        links: function() {
            return document.querySelectorAll('[data-url]')
        }
    },

    currentScrollTopPosition: 0,

    themes: {
        light: 'assets/css/theme.light.css',
        dark: 'assets/css/theme.dark.css'
    },

    //Settings
    settings: {
        defaults: {
            'isInit':true,
            'openLinksInNewTabs':false,
            'showFoldersPath': true,
            'rememberScrollPosition':true,
            'editEnabled':true,
            'sortEnabled':true,
            'openedFolders':[],
            'scrollPosition': 0,
            'showEmptyFolders': false,
            'theme': 'system',
            'showScrollButton': true
        },
        current: {},
        get: (key, callback) => {
            chrome.storage.local.get(key, result => {
                if('isInit' in result) {
                    app.settings.current = result;
                } else {
                    app.settings.current = app.settings.defaults;
                    app.settings.reset(() => {
                        app.controls('refresh', 'begin', app.dom.controlButtonRefresh);
                    });
                }
                callback(result);
            });
        },
        save: (obj, callback) => {
            chrome.storage.local.set(obj, () => {
                if(typeof callback == 'function') callback();
            });
        }, 
        update: callback => {
            app.settings.get(null, result => {
                for (var prop in result) {
                    var el = document.getElementById(prop);
                    if(!el) { 
                        continue;
                    }
                    if(el.type == 'checkbox') {
                        el.checked = result[prop];
                    }
                    if(el.type == 'select-one') {
                        let options = el.getElementsByTagName('option');
                        for (let option of options) {
                            option.selected = (option.value == result[prop]) ? true : false;
                        }
                    }
                }
                if(typeof callback == 'function') callback();
            });
        },
        reset: callback => {
            chrome.storage.local.clear(() => {
                chrome.storage.local.set(app.settings.defaults, () => {
                    if(typeof callback == 'function') callback();
                });
            });
        },
        listener: () => {

            //Autosave settings when settings form was changed
            app.dom.settingsForm.addEventListener('change', field => {
                let settings = {};
                if(field.target.type == 'checkbox') {
                    settings[field.target.id] = field.target.checked;
                }
                if(field.target.type == 'select-one') {
                    settings[field.target.id] = field.target.options[field.target.selectedIndex].value;
                }
                app.settings.save(settings, () => {
                    app.controls('refresh', 'begin', app.dom.controlButtonRefresh);
                });
                
            });

            //Reset settings button
            app.dom.settingsReset.addEventListener('click', e => {
                e.preventDefault();
                app.settings.reset(() => {
                    app.controls('refresh', 'begin', app.dom.controlButtonRefresh);
                });
            });

            //Close settings popup
            app.dom.settingsClose.addEventListener('click', e => {
                e.preventDefault();
                app.controls('settings', 'end', app.dom.controlButtonSettings);
            });

            //Remember scroll position
            var isScrolling;
            app.dom.body.addEventListener('scroll', event => {
                if(!app.settings.current.rememberScrollPosition || app.isSearching()) {
                    return;
                }
                window.clearTimeout(isScrolling);
                isScrolling = setTimeout(() => {
                    app.currentScrollTopPosition = app.dom.body.scrollTop;
                    document.getElementById('currentScrollPos').textContent = app.currentScrollTopPosition+"px";
                    app.settings.save({'scrollPosition': app.currentScrollTopPosition}, () => {
                        //console.log('Scroll saved at: '+app.currentScrollTopPosition);
                    });
                }, 90);
            }, false);

            //Search listener. Close all opened popup's oninput
            app.dom.searchInput.addEventListener('input', function(){
                app.search(this.value);
                app.controls('settings', 'end', app.dom.controlButtonSettings);
                app.controls('help', 'end', app.dom.controlButtonHelp);
                app.controls('folderedit', 'end');
                app.controls('linkedit', 'end');
            });

            //Exit search mode button
            app.dom.searchCancelButton.addEventListener('click', function(){
                app.cancelSearch();
            });

            //Bookmark manager: submit form listener
            app.dom.linkEditorForm.addEventListener('submit', function(e) {
                e.preventDefault();
                app.linkEditor.update(app.linkEditor.serialize());
            });

            //Bookmark manager: remove bookmark
            app.dom.linkEditorRemoveButton.addEventListener('click', function(){
                app.linkEditor.remove(app.linkEditor.serialize());
            });

            //Bookmark manager: close editor without changes
            app.dom.linkEditorCloseButton.addEventListener('click', function(){
                app.controls('linkedit', 'end');
            });

            //Folder manager: submit form listener
            app.dom.folderEditorForm.addEventListener('submit', function(e) {
                e.preventDefault();
                app.folderEditor.update(app.folderEditor.serialize());
            });

            //Folder manager: close editor without changes
            app.dom.folderEditorCloseButton.addEventListener('click', function(){
                app.controls('folderedit', 'end');
            });

            //ScrollerButton click
            app.dom.scrollerButton.addEventListener('click', function() {
                app.scroller.scroll();
            });

        }
    },

    //Build bookmark tree
    rawTree: callback => {
        chrome.bookmarks.getTree(branch => {
            app.raw = branch[0];
            if(typeof callback == 'function') callback();
        });
    },

    //Check empty folders
    showEmptyFolders: function(length) {
        return (this.settings.current.showEmptyFolders) ? true : (length > 0);
    },

    //Build HTML from tree
    buildHtml: function(tree) {
        tree.children.forEach(element => {
            if(element.children && app.showEmptyFolders(element.children.length)) {
                app.dom.content += `
                    <li class="bookmarks__folder ${app.getFolderClassName(element.id)}" data-id="${element.id}">
                        <span>${element.title}</span>
                        <ul>`;
                app.buildHtml(element);
                app.dom.content += `</li>`;
            } else if(element.url){
                let favicon = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(element.url)}&size=32`;
                app.dom.content += `
                    <li style="background-image:url(${favicon})" data-url="${element.url}" data-id="${element.id}">
                        <span title="${element.title.length > 45 ? element.title : ''}">${element.title}</span>
                    </li>`;
                app.counter++;
            }
        });
        this.dom.content += '</ul>';
    },

    //Append HTML to DOM
    insertHtml: function(callback) {
        this.dom.body.innerHTML = (this.counter === 0) 
            ? `<div class="bookmarks__empty" data-message="bookmarks_empty"></div>` 
            : this.dom.content;
        callback();
    },

    //Switch focus
    switchFocus: element => element.focus(),

    //Apply theme and show popup content right after theme loaded
    applyTheme: function(href, callback) {

        //Check user OS if dark theme enabled
        let isDarkThemeOsEnabled = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        if(!this.settings.current.theme || this.settings.current.theme == 'system') {
            this.dom.themeLink.href = isDarkThemeOsEnabled ? this.themes['dark'] : this.themes['light'];
        } else {
            this.dom.themeLink.href = href || this.themes[this.settings.current.theme] || this.themes['light'];
        }
        this.dom.themeLink.onload = () => {
            this.dom.wrapper.style.display = 'block';
            this.switchFocus(this.dom.searchInput);
            if(typeof callback == 'function') callback();
        }
    },

    //Apply settings
    appendSettings: function() {
        //Call theme to load and scroll to last saved position
        this.applyTheme(false, function() {
            app.scrollToSavedPosition();
        });
    },

    scrollToPosition: function(offset, behavior) {
        app.dom.body.scrollTo({
            top: offset,
            behavior: behavior || 'auto'
        });
    },

    scrollToSavedPosition() {
        if(this.settings.current.rememberScrollPosition && this.settings.current.scrollPosition > 0) {
            this.scrollToPosition(this.settings.current.scrollPosition);
        }
    },

    //Translate
    translate: function() {
        let containers = document.querySelectorAll('[data-message]');
        containers.forEach(container => {
            let id = container.dataset.message, message = chrome.i18n.getMessage(id);
            container.innerText = message;
        })
    },

    //Toggle folder path lines view if option enabled
    toggleFolderViewPath: function() {
        (this.settings.current.showFoldersPath) ? this.dom.body.classList.add('show-path') : this.dom.body.classList.remove('show-path');
    },

    toggleControls(state) {
        this.dom.controlButtons.forEach(control => {
            switch (state) {
                case 'disable': 
                    control.setAttribute('disabled', 'disabled')
                    break;
                case 'enable': 
                    control.removeAttribute('disabled');
                    break;
            }
        });
    },

    //Search logic
    search: function(keywords) {

        keywords = keywords.trim();

        if(keywords.length > 0) {

            this.toggleControls('disable');
            this.dom.body.classList.add('bookmarks--searching');
            this.expandFolders(true);

            //Scroll to first found item
            app.scrollToPosition(1, 'smooth');
            
        } else {

            this.toggleControls('enable');
            this.dom.body.classList.remove('bookmarks--searching');
            this.expandFolders(false);

            //Scroll to saved position after searching
            setTimeout(function() {
                app.resizeWindow();
                app.scrollToPosition(app.currentScrollTopPosition, 'smooth');
            }, 10);
        }

        let items = document.querySelectorAll('.bookmarks li[data-url]'),
            count = 0;

        items.forEach(item => {

            var text = item.innerHTML.toLowerCase(), 
                url  = item.dataset.url;

            if(text.includes(keywords.toLowerCase()) || url.includes(keywords.toLowerCase())) {
                item.style.display = 'list-item';
                count++;
            } else {
                item.style.display = 'none'
            }
            
        });

        //Search counter update
        this.dom.searchCount.textContent = count;

        //Scroller button reinit
        app.scroller.init();
    },

    isSearching() {
        return this.dom.body.classList.contains('bookmarks--searching');
    },

    cancelSearch() {
        this.dom.searchInput.value = '';
        this.search('');
        this.switchFocus(this.dom.searchInput);
    },

    //Expand or collapse folder
    expandFolders: function(state) {
        this.dom.folders().forEach(folder => {
            folder = folder.parentNode;
            if(!folder.classList.contains('bookmarks__folder--opened') && state === true) {
                folder.classList.add('bookmarks__folder--temp-opened');
            } else if(folder.classList.contains('bookmarks__folder--temp-opened') && state === false) {
                folder.classList.remove('bookmarks__folder--temp-opened');
            }
        });
    },

    //Register control buttons events
    registerControls:function() {
        this.dom.controlButtons.forEach(control => {
            control.addEventListener('click', function(){
                let name = this.dataset.control;
                if(this.classList.toggle('control__item--active')){
                    app.controls(name, 'begin', this);
                } else {
                    app.controls(name, 'end', this);
                }
            })
        });
    },

    //Control events
    controls: function(name, action, button){
        switch (name) {
            case 'settings':
                if(action == 'begin') {
                    this.dom.settings.classList.add('active');
                    this.controls('help', 'end', this.dom.controlButtonHelp);
                    this.controls('linkedit', 'end');
                    this.controls('folderedit', 'end');
                    this.resizeWindow(550);
                    this.switchFocus(this.dom.themeSelect);
                } else if(action == 'end') {
                    this.dom.settings.classList.remove('active');
                    button.classList.remove('control__item--active');
                    this.resizeWindow();
                    this.switchFocus(this.dom.searchInput);
                }
            break;
            case 'help': 
                if(action == 'begin') {
                    this.dom.help.classList.add('active');
                    this.controls('settings', 'end', this.dom.controlButtonSettings);
                    this.controls('linkedit', 'end');
                    this.controls('folderedit', 'end');
                    this.resizeWindow(500);
                } else if(action == 'end') {
                    this.dom.help.classList.remove('active');
                    button.classList.remove('control__item--active');
                    this.resizeWindow();
                    this.switchFocus(this.dom.searchInput);
                }
            break;
            case 'linkedit': 
                if(action == 'begin') {
                    this.dom.linkEditor.classList.add('active');
                    this.resizeWindow(300);
                } else if(action == 'end') {
                    this.dom.linkEditor.classList.remove('active');
                    this.resizeWindow();
                    this.switchFocus(this.dom.searchInput);
                }
            break;
            case 'folderedit': 
                if(action == 'begin') {
                    this.dom.folderEditor.classList.add('active');
                    this.resizeWindow(300);
                } else if(action == 'end') {
                    this.dom.folderEditor.classList.remove('active');
                    this.resizeWindow();
                    this.switchFocus(this.dom.searchInput);
                }
            break;
            case 'refresh':
                if(action == 'begin') {
                    this.refresh(button, function() {
                        app.controls(name, 'end', button);
                    });
                } else if(action == 'end') {
                    button.classList.remove('control__item--refreshing','control__item--active');
                    this.switchFocus(this.dom.searchInput);
                }
            break;
        }
    },
    
    //Get folder classname by id
    getFolderClassName: function(id) {
        return (this.settings.current.openedFolders.indexOf(id) != -1) ? 'bookmarks__folder--opened' : '';
    },

    //Register user actions
    userActionsInit: function() {

        //Folder actions
        this.dom.folders().forEach(folder => {

            //Adding tabindex
            folder.setAttribute('tabindex', 1);

            //Left mouse button click on folder
            folder.addEventListener('click', function() {
                if(app.isSearching()) return;
                let id = this.parentNode.dataset.id, opened = app.settings.current.openedFolders;
                if(this.parentNode.classList.toggle('bookmarks__folder--opened')) {
                    if(opened.indexOf(id) === -1) {
                        opened.push(id);
                    }
                } else {
                    let index = opened.indexOf(id);
                    if (index > -1) {
                        opened.splice(index, 1);
                    }
                }
                app.settings.save({'openedFolders': opened}, function(){});
                app.resizeWindow();
            });

            //Right mouse button click on folder
            folder.oncontextmenu = function (e) {
                if(app.settings.current.editEnabled) {
                    e.preventDefault();
                    app.folderEditor.prepare({
                        id:     folder.parentNode.dataset.id,
                        title:  folder.innerText
                    });
                }
            }

        });

        //Sortable
        if(this.settings.current.sortEnabled) {
            app.dom.body.querySelectorAll('ul').forEach(el => {
                Sortable.create(el, {
                    group: 'container',
                    animation: 150,
                    //Prevent default folders sorting
                    filter:'li[data-id="1"], li[data-id="2"]',
                    parentEl: false,
                    onMove: event => {
                        //Prevent moving out of container
                        if(event.to.parentNode.dataset.id === undefined) return false;
                        //Prevent sorting while searching
                        return !app.isSearching();
                    },
                    onChoose: event => {
                        this.parentEl = event.to.parentNode.dataset.id;
                    },
                    onEnd: event => {
                        let id = event.item.dataset.id, parentId = event.to.parentNode.dataset.id, index = event.newIndex;
                        if(this.parentEl == parentId && index > event.oldIndex) {
                            index++;
                        }
                        if(!Number(id) || !Number(parentId) || index < 0) return;
                        chrome.bookmarks.move(id, {
                            parentId: parentId,
                            index: index
                        });
                    }
                });
            });

        }

        //Bookmark actions
        this.dom.links().forEach(link => {

            //Adding tabindex
            link.setAttribute('tabindex', 1);

            //Left mouse button click on bookmark
            link.onclick = function(e) {
                app.go({
                    element     : e,
                    key         : e.which,
                    ctrlKey     : e.ctrlKey,
                    url         : link.dataset.url,
                    newtab      : app.settings.current.openLinksInNewTabs,
                    tab         : link.dataset.tab
                });
            }

            //Middle mouse button click on bookmark
            link.addEventListener('mousedown', function(e){
                if (e.which == 2) {
                    app.go({
                        element     : e,
                        key         : 1,
                        ctrlKey     : true,
                        url         : link.dataset.url,
                        newtab      : true,
                        tab         : link.dataset.tab
                    });
                }
            });

            //Right mouse button click on bookmark
            link.oncontextmenu = function (e) {
                e.preventDefault();
                if(app.settings.current.editEnabled) {
                    app.linkEditor.prepare({
                        id:     link.dataset.id,
                        icon:   link.style.backgroundImage,
                        title:  link.querySelector('span').innerText,
                        url:    link.dataset.url
                    });
                }
            }
        });

        //Keyboard controls
        document.onkeydown = function(e) {
            if(e.which === 32 || e.which === 13) {
                var element = document.activeElement, isFolder = element.parentNode.classList.contains('bookmarks__folder');
                if(element.dataset.url || isFolder) {
                    e.preventDefault();
                    element.click();
                }
            }
        }
    },

    //Open bookmark
    go: function(param) {
        if(param.key === 1) {
            if(param.ctrlKey) {
                chrome.tabs.create({url: param.url, active: false});
            } else if(param.newtab) {
                chrome.tabs.create({url: param.url, active: true});
            } else {
                chrome.tabs.getSelected(null, function(tab) {
                    chrome.tabs.update(tab.id, {url: param.url});
                    window.close();
                });
            }
        }
    },

    //Adaptive height
    resizeWindow: function(height) {
        document.documentElement.style.height = document.body.style.height = height || this.dom.wrapper.scrollHeight;
    },

    //Bookmark manager
    linkEditor: {
        prepare: function(data) {
            app.controls('linkedit', 'begin', this);
            app.dom.linkEditorFieldId.value = data.id;
            window.setTimeout(function(){
                app.dom.linkEditorFieldTitle.value = data.title;
                app.dom.linkEditorFieldUrl.value = data.url;
                app.dom.linkEditorFieldTitle.style.backgroundImage = data.icon;
                app.dom.linkEditorFieldTitle.focus()
            }, 100);

            //Open bookmark in private mode
            app.dom.linkEditorOpenIncognito.onclick = function() {
                chrome.windows.create({url: data.url, incognito: true});
            };
            
        },
        update: function(data) {
            chrome.bookmarks.update(data.id, {title: data.title, url: data.url}, function(){
                app.controls('linkedit', 'end', this);
                let item = document.querySelector('[data-id="'+data.id+'"]');
                item.querySelector('span').textContent = data.title;
                item.dataset.url = data.url;
            });
        },
        remove: function(data) {
            chrome.bookmarks.remove(data.id, function(){
                app.controls('linkedit', 'end', this);
                let item = document.querySelector('[data-id="'+data.id+'"]');
                item.classList.add('link-removed');
                item.addEventListener("animationend", item => {
                    item.target.remove();
                    app.resizeWindow();
                });
                if(app.isSearching()) {
                    app.dom.searchCount.textContent = app.dom.searchCount.textContent - 1;
                }
            });
        },
        serialize: function(){
            return {
                id: app.dom.linkEditorFieldId.value,
                title: app.dom.linkEditorFieldTitle.value,
                url: app.dom.linkEditorFieldUrl.value
            }
        }
    },

    //Folder manager
    folderEditor : {
        prepare: function(data) {
            if(data.id == 1 || data.id == 2 || app.isSearching()) return;
            app.controls('folderedit', 'begin');
            app.dom.folderEditorFieldId.value = data.id;
            window.setTimeout(function(){
                app.dom.folderEditorFieldTitle.value = data.title;
                app.dom.folderEditorManagerLink.dataset.url = 'chrome://bookmarks/?id=' + data.id;
                app.dom.folderEditorFieldTitle.focus()
            }, 100);

            app.dom.folderEditorOpenAll.onclick = function() {
                app.openLinksInNewTabs(data.id);
            };

        },
        update: function(data) {
            chrome.bookmarks.update(data.id, {title: data.title}, function(){
                app.controls('folderedit', 'end');
                app.controls('refresh', 'begin', app.dom.controlButtonRefresh);
            });
        },
        serialize: function(){
            return {
                id: app.dom.folderEditorFieldId.value,
                title: app.dom.folderEditorFieldTitle.value
            }
        }
    },

    //Open bookmarks in new tabs
    openLinksInNewTabs: folderId => {
        chrome.bookmarks.getSubTree(folderId, function(result){
            let links = result[0].children;
            if(typeof links !== 'object') return;
            links.forEach(link => {
                if(link.url) {
                    chrome.tabs.create({url: link.url, active: false});
                }
            });
            app.controls('folderedit', 'end');
            app.controls('refresh', 'begin', app.dom.controlButtonRefresh);
        });
    },

    //Scroller
    scroller: {
        status : {
            direction: false,
            visible: false
        },
        draw(){
            var height           = app.dom.body.offsetHeight,
                heightWithScroll = app.dom.body.scrollHeight,
                top              = app.dom.body.scrollTop,
                bottom           = heightWithScroll - top - height;

                app.scroller.status.direction = 
                (top > bottom) 
                ? 'top' 
                : 'bottom';

                app.scroller.status.visible = 
                (top > height / 3 && heightWithScroll > height) 
                ? true 
                : false;

                if(app.scroller.status.visible && app.settings.current.showScrollButton) {
                    app.dom.scrollerButton.classList.add('scroller--visible');

                    if(app.scroller.status.direction == 'top') {
                        app.dom.scrollerButton.classList.add('scroller--top');
                    } else {
                        app.dom.scrollerButton.classList.remove('scroller--top');
                    }

                } else {
                    app.dom.scrollerButton.classList.remove('scroller--visible')
                }
        },
        scroll() {
            switch (app.scroller.status.direction) {
                case 'top':
                    app.scrollToPosition(0, 'smooth')
                    break;
                case 'bottom':
                    app.scrollToPosition(app.dom.body.scrollHeight, 'smooth')
                    break;
            }
        },
        update() {
            var nowScrolling;
            window.clearTimeout(nowScrolling);
                nowScrolling = setTimeout(() => {
                    app.scroller.draw();
            }, 50);
        },
        init() {
            if(app.settings.current.showScrollButton) {
                app.scroller.draw();
                app.dom.body.addEventListener('scroll', app.scroller.update, false);
            } else {
                app.dom.body.removeEventListener('scroll', app.scroller.update, false);
                app.dom.scrollerButton.classList.remove('scroller--visible','scroller--top');
            }
        }
    },

    //Draw version
    drawVersion: function() {
        this.dom.versionContainer.textContent = this.manifest.version || '';
    },

    //Refresh bookmarks tree
    refresh: function(button, callback) {
        if(button.classList.contains('control__item--refreshing')) return;
        button.classList.add('control__item--refreshing');
        setTimeout(function(){
            app.settings.update(function(){
                app.rawTree(function(){
                    app.dom.content = '';
                    app.buildHtml(app.raw);
                    app.insertHtml(function() {
                        app.appendSettings();
                        app.userActionsInit();
                        app.translate();
                        app.toggleFolderViewPath();
                        app.scroller.init();
                    });
                    callback();
                });
            });
        }, 500);
    },

    //App start
    init: function() {
        this.settings.update(function(){
            app.rawTree(function(){
                app.buildHtml(app.raw);
                app.insertHtml(function() {
                    app.appendSettings();
                    app.registerControls();
                    app.userActionsInit();
                    app.translate();
                    app.toggleFolderViewPath();
                    app.scroller.init();
                });
                app.settings.listener();
            });
            app.drawVersion();
        });
    }
}

app.init();