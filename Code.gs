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
            if (elements[i].isPartial()) {
                var element = elements[i].getElement().asText();
                var startIndex = elements[i].getStartOffset();
                var endIndex = elements[i].getEndOffsetInclusive();

                text.push(element.getText().substring(startIndex, endIndex + 1));
            } else {
                var element = elements[i].getElement();
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
            throw 'Please select some text.';
        }

        return text;
    } else {
        throw 'Please select some text.';
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
    //var url = "http://eexcess.joanneum.at/eexcess-privacy-proxy/api/v1/recommend";
    // federated recommender
    var url = "http://eexcess.joanneum.at/eexcess-federated-recommender-web-service-1.0-SNAPSHOT/recommender/recommend";

    // POST payload
    //var data = {"numResults": 60, "contextKeywords": []};
    var data = {"numResults": 15, "contextKeywords": []};

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
