/*  Copyright 2014 University of Passau
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * Creates a menu entry in the Google Docs UI when the document is opened.
 *
 * @param {object} e The event parameter for a simple onOpen trigger. To
 *     determine which authorization mode (ScriptApp.AuthMode) the trigger is
 *     running in, inspect e.authMode.
 */
function onOpen(e) {
    DocumentApp.getUi().createAddonMenu()
        .addItem('Start', 'showSidebar')
        .addToUi();
    DocumentApp.getUi().createAddonMenu().addSeparator();
}

/**
 * Runs when the add-on is installed.
 *
 * @param {object} e The event parameter for a simple onInstall trigger. To
 *     determine which authorization mode (ScriptApp.AuthMode) the trigger is
 *     running in, inspect e.authMode. (In practice, onInstall triggers always
 *     run in AuthMode.FULL, but onOpen triggers may be AuthMode.LIMITED or
 *     AuthMode.NONE.)
 */
function onInstall(e) {
    onOpen(e);
}

/**
 * Opens a sidebar in the document containing the add-on's user interface.
 */
function showSidebar() {
    var ui = HtmlService.createTemplateFromFile('Sidebar').evaluate()
        .setTitle('E-Explorer');
    DocumentApp.getUi().showSidebar(ui);
}

/**
 * Returns the contents of a HTML file.
 * @param {string} file The name of the file to retrieve.
 * @return {string} The file's content.
 */
function include(file) {
    return HtmlService.createTemplateFromFile(file).evaluate().getContent();
}

/**
 * Gets the text the user has selected. If there is no selection,
 * this function displays an error message.
 *
 * @return {Array.<string>} The selected text.
 */
function getSelectedText() {
    var selection = DocumentApp.getActiveDocument().getSelection();

    if (selection) {
        var text = [];
        var elements = selection.getRangeElements();

        for (var i = 0; i < elements.length; i++) {
            var element;

            if (elements[i].isPartial()) {
                element = elements[i].getElement().asText();
                var startIndex = elements[i].getStartOffset();
                var endIndex = elements[i].getEndOffsetInclusive();

                text.push(element.getText().substring(startIndex, endIndex + 1));
            } else {
                element = elements[i].getElement();
                // Only translate elements that can be edited as text; skip images and
                // other non-text elements.
                if (element.editAsText) {
                    var elementText = element.asText().getText();
                    // This check is necessary to exclude images, which return a blank
                    // text element.
                    if (elementText != '') {
                        text.push(elementText);
                    }
                }
            }
        }

        if (text.length == 0) {
            throw 'Select some text.';
        }

        return text;
    } else {
        throw 'Select some text.';
    }
}

/**
 * Fetches the recommendations for the given text.
 *
 * @param {Array<String>}   text for which the recommendations should be fetched
 * @return {String} The response as JSON string.
 */
function fetchRecommendations(text) {
    return callProxy(getTerms(text));
}

/**
 * Gets the recommendations from the selected user text.
 *
 * @param {Array<String>} text The text entered by the user as array.
 *
 * @return {Array<String>} The terms as an array.
 */
function getTerms(text) {
    var terms = [];

    // Split the text into terms
    for(t in text) {
        var tmp = text[t].split(" ");
        for(i in tmp) {
            // Replace multiple whitespaces and punctuation marks from the terms
            terms.push(tmp[i].replace(/\s/g, "").replace(/[\.,#-\/!$%\^&\*;:{}=\-_`~()]/g,""));
        }
    }

    return terms;
}

/**
 * Calls the privacy proxy
 *
 * @param {Array<String>} terms The single terms.
 *
 * @return {String} The response as JSON string.
 */
function callProxy(terms) {
    // privacy proxy URL
    var url = serverUri +  "eexcess-privacy-proxy-1.0-SNAPSHOT/api/v1/recommend";

    // get result number
    var numResults = getResultNumber();

    // POST payload
    var data = {"numResults": numResults, "partnerList": [], "contextKeywords": []};

    // set partners
    var partners = getPartnerSettings();
    partners = JSON.parse(partners);

    for(var i=0;i<partners.length;i++) {
        var partner = partners[i];
        if (partner.active) {
            data["partnerList"].push({"systemId": partner.name});
        }
    }

     // Fill the context array
    for (i in terms) {
        data["contextKeywords"].push({"weight": 1.0 / terms.length, "text": terms[i]});
    }

    // Options object, that specifies the method, content type and payload of the HTTPRequest
    var options = {
        "method": "POST",
        "contentType": "application/json",
        "origin": "gdocs",
        "headers": {
            "Accept": "application/json"
        },
        "payload": JSON.stringify(data)
    };
    try {
        var response = UrlFetchApp.fetch(url, options);
        return response.getContentText();
    } catch (err) {
        throw msg('ERROR');
    }
}

/**
 * Returns the internationalized message corresponding to the given key. Default language English will be chosen if
 * user's locale is not supported.
 *
 * @param key   message's key
 * @returns {String} internationalized message
 */
function msg(key) {
    if (!this.messages){
        var locale = Session.getActiveUserLocale();
        var file;

        if (locale == 'de') {
            file = 'messages_de';
        } else { // use default locale 'en'
            file = 'messages'
        }

        this.messages = JSON.parse(HtmlService.createTemplateFromFile(file).evaluate().getContent());
    }

    return this.messages[key];
}

var serverUri = "http://eexcess-dev.joanneum.at/";

/**
 * Opens and displays the settings dialog.
 */
function openSettingsDialog() {
    var html = HtmlService.createTemplateFromFile('SettingsDialog').evaluate()
        .setSandboxMode(HtmlService.SandboxMode.IFRAME)
        .setWidth(380)
        .setHeight(300);
    DocumentApp.getUi() // Or DocumentApp or FormApp.
        .showModalDialog(html, msg('SETTINGS'));
}

/**
 * Fetches the supported providers from the privacy proxy.
 *
 * @returns {*} supported providers
 */
function fetchProviders() {
    // privacy proxy URL
    var url = serverUri +  "eexcess-privacy-proxy-1.0-SNAPSHOT/api/v1/getRegisteredPartners";

    try {
        var response = UrlFetchApp.fetch(url);
        return response.getContentText();
    } catch (err) {
        throw msg('ERROR');
    }
}

var propertiesStore = PropertiesService.getUserProperties();

/**
 * Gets the value associated with the given key in the current Properties store, or null if no such key exists.
 *
 * @param {String} key   property's key
 * @returns {String}    property's value or null
 */
function getProperty(key) {
    return propertiesStore.getProperty(key);
}

/**
 * Returns the result number set by the user or if not specified the default result number 24.
 *
 * @returns {String}    result number
 */
function getResultNumber() {
    var resultNumber = getProperty('EEXXCESS_NUM_RESULTS');

    if (resultNumber===null) {
        resultNumber = 24;
    }

    return resultNumber;
}

/**
 * Stores the result number and the partner settings.
 *
 * @param resultNumber
 * @param partnerSettings
 */
function saveSettings(resultNumber, partnerSettings) {
    setProperty('EEXXCESS_NUM_RESULTS', resultNumber);
    setProperty('EEXXCESS_STORED_PARTNERS', partnerSettings);
}

/**
 * Sets the given key-value pair in the current Properties store.
 *
 * @param {String} key  property's key
 * @param {String} value    property's value
 */
function setProperty(key, value) {
    propertiesStore.setProperty(key, value);
}

/**
 * Returns the partner settings.
 */
function getPartnerSettings() {
    // get all available partners
    var allPartners = fetchProviders();

    try{
        allPartners = JSON.parse(allPartners);
        allPartners = allPartners.partner;
    } catch (e) {
        allPartners = [];
    }

    // get stored partners
    var storedPartners = getProperty('EEXXCESS_STORED_PARTNERS');

    try{
        storedPartners = JSON.parse(storedPartners);
    } catch (e) {
        storedPartners = [];
    }

    var partnerSettings = [];

    for (var i = 0; i < allPartners.length; i++) {
        var partnerName = allPartners[i].systemId;
        var storeIdx = inArray(partnerName, storedPartners, 'name');

        if (storeIdx === -1) { // new partner -> make active
            partnerSettings.push({"name": partnerName, "active": true});
        } else { // use stored value
            partnerSettings.push(storedPartners[storeIdx]);
        }
    }

    return JSON.stringify(partnerSettings);
}

/**
 * Checks if the given element is contained the given array. If the array is 2-dimensional the element's key in the
 * array is also required.
 *
 * @param elem  element to search
 * @param arr   array to search through
 * @param arrKey    element's key in the 2-dimensional array
 * @returns {number}    element's position in the array or -1 if array doesn't contain the element
 */
function inArray( elem, arr, arrKey) {
    if (arr !== null) {
        for (var i = 0; i < arr.length; i++) {
            var arrayElem = arr[i];

            if ((arrKey && elem === arrayElem[arrKey]) || elem === arrayElem)
                return i;
        }
    }

    return -1;
}