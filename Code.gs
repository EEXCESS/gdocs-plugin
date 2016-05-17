/*  Copyright 2016 University of Passau
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
        .setSandboxMode(HtmlService.SandboxMode.IFRAME)
        .setTitle('E-Explorer');
    DocumentApp.getUi().showSidebar(ui);
}

/**
 * Returns the contents of a HTML file.
 * @param {string} file The name of the file to retrieve.
 * @return {string} The file's content.
 */
function include(file) {
    return HtmlService.createTemplateFromFile(file).evaluate()
        .setSandboxMode(HtmlService.SandboxMode.IFRAME)
        .getContent();
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

var serverUrl = "https://eexcess.joanneum.at/eexcess-privacy-proxy-issuer-1.0-SNAPSHOT/issuer/";
var origin = {
    "clientType": "EEXCESS - Google Docs AddOn",
    "clientVersion": "8.0", //the deployment version in the webstore
    "module": "Sidebar",
    "userID": Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Session.getActiveUser().getEmail()).toString() // hash value of uid here: MD5(User-Mail)
};

/**
 * Calls the privacy proxy for fetching the recommendations for the given keywords.
 *
 * @param {Array<String>} keywords The single keywords.
 *
 * @return {String} The response as JSON string.
 */
function fetchRecommendations(keywords) {
    // privacy proxy URL
    var url = serverUrl + "recommend";

    // get result number
    var numResults = getResultNumber();

    // POST payload
    var data = {
        "numResults": numResults,
        "partnerList": [],
        "contextKeywords": [],
        "origin": origin
    };

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
    for (i in keywords) {
        data["contextKeywords"].push({"text": keywords[i]});
    }

    // Options object, that specifies the method, content type and payload of the HTTPRequest
    var options = {
        "method": "POST",
        "contentType": "application/json",
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

var DEFAULT_LOCALE = 'en';

/**
 * Returns the user's current locale. If his locale is not supported the DEFAULT_LOCALE will be chosen.
 *
 * @returns {String} user's locale
 */
function getLocale() {
    var locale = Session.getActiveUserLocale();

    if (locale === 'de') {
        return locale;
    } else { // return default locale
        return DEFAULT_LOCALE;
    }
}

var messages;
var defaultMessages;

/**
 * Returns the internationalized message corresponding to the given key. DEFAULT_LOCALE will be chosen if no translation
 * is available for the user's locale.
 *
 * @param key   message's key
 * @returns {String} internationalized message
 */
function msg(key) {
    if (!messages){
        messages = JSON.parse(
            HtmlService.createTemplateFromFile('messages_' + getLocale()).evaluate()
                .setSandboxMode(HtmlService.SandboxMode.IFRAME)
                .getContent());
        defaultMessages = JSON.parse(HtmlService.createTemplateFromFile('messages_' + DEFAULT_LOCALE).evaluate()
            .setSandboxMode(HtmlService.SandboxMode.IFRAME)
            .getContent());
    }

    var msg = messages[key];

    if (!msg) {
        msg = defaultMessages[key];
    }

    return msg
}

/**
 * Opens and displays the settings dialog.
 */
function openSettingsDialog() {
    var html = HtmlService.createTemplateFromFile('SettingsDialog').evaluate()
        .setSandboxMode(HtmlService.SandboxMode.IFRAME)
        .setWidth(300)
        .setHeight(300);
    DocumentApp.getUi() // Or DocumentApp or FormApp.
        .showModalDialog(html, msg('SETTINGS'));
}

/**
 * Fetches the supported providers from the privacy proxy.
 *
 * @returns {String} supported providers
 */
function fetchProviders() {
    // privacy proxy URL
    var url = serverUrl + "getRegisteredPartners";

    // Options object, that specifies the method and accepted response type of the HTTPRequest
    var options = {
        "method": "GET",
        "headers": {
            "Accept": "application/json"
        }
    };

    try {
        var response = UrlFetchApp.fetch(url, options);
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
 *
 * @returns {String}    partner settings
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

/**
 * Inserts a link right after the current cursor position/selection and logs this event.
 *
 * @param displayName   link's name to display
 * @param documentBadge documentBadge needed for logging containing the link's uri
 * @param queryID       current query's id needed for logging
 */
function insertLink(displayName, documentBadge, queryID) {
    var uri = documentBadge.uri;

    var doc = DocumentApp.getActiveDocument();

    var cursor = doc.getCursor();
    var paragraph;

    if (cursor) {
        var surroundingText = cursor.getSurroundingText().getText();
        var surroundingTextOffset = cursor.getSurroundingTextOffset();

        cursor.insertText(' ');

        var element = cursor.insertText(displayName);
        element.setLinkUrl(uri);

        // If the cursor follows a non-space character, insert a space and then the link.
        if (surroundingTextOffset > 0 && surroundingText.charAt(surroundingTextOffset - 1) != ' ')
            cursor.insertText(' ');

        return;
    }

    var selection = doc.getSelection();

    if (selection) {
        var elements = selection.getRangeElements();
        var element = elements[elements.length - 1];

        var text = element.getElement().editAsText();

        if (text) {
            var offset = element.getEndOffsetInclusive() + 1;

            text.insertText(offset, ' ' + displayName);
            text.setLinkUrl(offset + 1, offset + displayName.length, uri);
        }
    }

    logItemCitedAsHyperlink(documentBadge, queryID);
}

/**
 * Inserts an image specified by its uri to a new paragraph after the current cursor position/selection and logs this
 * event.
 *
 * @param date  current date for image citation string
 * @param image image's uri
 * @param documentBadge documentBadge needed for logging
 * @param queryID       current query's id needed for logging
 */
function insertImage(date, image, documentBadge, queryID) {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();
    var paragraph;

    if (cursor) {
        paragraph = cursor.getElement();
    }

    var selection;

    if (!paragraph) {
        selection = doc.getSelection();
    }

    if (selection) {
        var selectedElements = selection.getSelectedElements();
        var selectedElement = selectedElements[0];

        //holds the paragraph
        var paragraph = selectedElement.getElement();
    }

    if (paragraph) {
        while (paragraph.getType() !== DocumentApp.ElementType.PARAGRAPH) {
            paragraph = paragraph.getParent();
        }

        //get the index of the paragraph in the body
        var body = doc.getBody();
        var paragraphIndex = body.getChildIndex(paragraph) + 1;

        // insert image
        var insertedParagraph = body.insertParagraph(paragraphIndex, '');
        var img = UrlFetchApp.fetch(image).getBlob();
        insertedParagraph.appendInlineImage(img);

        // insert citation with current date
        insertedParagraph.appendText('\r' + msg('CITATION_IMAGE_RETRIEVED') + " " + date + " " + msg('CITATION_IMAGE_AT') + " ");
        insertedParagraph.appendText(image).setLinkUrl(image);
    }

    logItemCitedAsImage(documentBadge, queryID);
}

/**
 * Logs that the given item was opened by the user.
 *
 * @param documentBadge item's document badge
 * @param queryID       current query's id
 */
function logItemOpened(documentBadge, queryID) {
    logEvent("itemOpened", documentBadge, queryID);
}

/**
 * Logs that the given item was cited in a document as image.
 *
 * @param documentBadge item's document badge
 * @param queryID       current query's id
 */
function logItemCitedAsImage(documentBadge, queryID) {
    logEvent("itemCitedAsImage", documentBadge, queryID);
}

/**
 * Logs that the given item was cited in a document as hyperlink.
 *
 * @param documentBadge item's document badge
 * @param queryID       current query's id
 */
function logItemCitedAsHyperlink(documentBadge, queryID) {
    logEvent("itemCitedAsHyperlink", documentBadge, queryID);
}

/**
 * Logs a given event for a specified item.
 *
 * @param event         event's name to complete the server url
 * @param documentBadge item's document badge
 * @param queryID       current query's id
 */
function logEvent(event, documentBadge, queryID) {
    // privacy proxy URL
    var url = serverUrl + "log/" + event;

    // POST payload
    var data = {
        "content": {
            "documentBadge": documentBadge
        },
        "origin": origin,
        "queryID": queryID
    };

    // Options object, that specifies the method, content type and payload of the HTTPRequest
    var options = {
        "method": "POST",
        "contentType": "application/json",
        "headers": {
            "Accept": "application/json"
        },
        "payload": JSON.stringify(data)
    };
    try {
        UrlFetchApp.fetch(url, options);
    } catch (err) {
        // suppress error -> not relevant for end user
    }
}