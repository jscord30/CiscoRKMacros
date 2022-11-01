/**********************************************************
PROGRAM HEADER
STANFORD HEALTH CARE - Technology & Digital Solutions
Programmer: Justin Scord
Last Modified Date: 2022-Sep-26
**********************************************************/
const BUILD_VERSION = '1.0.1'; //Version Control

const xapi = require('xapi');
const KEYBOARD_TYPES = {
    NUMERIC: 'Numeric',
    SINGLELINE: 'SingleLine',
    PASSWORD: 'Password',
    PIN: 'PIN'
};
const CALL_TYPES = {
    AUDIO: 'Audio',
    VIDEO: 'Video'
};

const DIALPAD_ID = 'Dialpad';
const DIALHOSTPIN_ID = 'Hostpin';
const INROOMCONTROL_ZoomCONTROL_PANELID = 'Dialer';

/* Use these to check that its a valid number (depending on what you want to allow users to call */
const REGEXP_URLDIALER = /([a-zA-Z0-9@_\-\.]+)/; /*  . Use this one if you want to allow URL dialling */
const REGEXP_NUMERICDIALER = /^([0-9]{3,12})$/; /* Use this one if you want to limit calls to numeric only. In this example, require number to be between 3 and 10 digits. */
const DIALPREFIX_AUDIO_GATEWAY = '9';

var Numbertodial;
var hostpin;
var isInBridgeCall = 0;
var dialType = REGEXP_NUMERICDIALER;
var DIALPOSTFIX_URI;
var bridgeType;
var bridgeInfo;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

xapi.event.on('CallDisconnect', (event) => { //clear all entries on call disconnect
    isInBridgeCall = 0;
    hostpin = '';
    Numbertodial = '';
});

function showDialPad(text, Placeholder, finText, type, title) {

    xapi.command("UserInterface Message TextInput Display", {
        InputType: type,
        Placeholder: Placeholder,
        Title: title,
        Text: text,
        SubmitText: finText,
        FeedbackId: DIALPAD_ID,
    }).catch((error) => {
        console.error(error);
    });
}

function pressEvent(event) {
  if(event.WidgetId.includes('call')){
    if (event.WidgetId === 'callZoom' && event.Type === 'clicked') {
        DIALPOSTFIX_URI = '@zoomcrc.com';
        bridgeType = 'Zoom Meeting';
        bridgeInfo = 'Enter Password';
    } else if (event.WidgetId === 'callWebex' && event.Type === 'clicked') {
        DIALPOSTFIX_URI = '@webex.com';
        bridgeType = 'WebEx Meeting';
        bridgeInfo = 'Enter Host Pin';
    } else if  (event.WidgetId === 'callTeams' && event.Type === 'clicked') {
        DIALPOSTFIX_URI = '.stanfordhealthcare@m.webex.com';
        bridgeType = 'Teams Meeting';
        bridgeInfo = 'Press Join';
    }
    if(event.WidgetId === 'callTeams'){ 
      showDialPad(
       "Enter the Video Conference ID:",
        " ",
        "Next",
        KEYBOARD_TYPES.NUMERIC,
        bridgeType
    );}
    else
    showDialPad(
       "Enter the Meeting ID:",
        " ",
        "Next",
        KEYBOARD_TYPES.NUMERIC,
        bridgeType
    );
  }
}

/* This is the listener for the in-room control panel button that will trigger the dial panel to appear */
xapi.event.on('UserInterface Extensions Widget Action', pressEvent);

xapi.event.on('UserInterface Message TextInput Response', (event) => {
    switch (event.FeedbackId) {
        case DIALPAD_ID:
            let match = dialType.exec(event.Text); // First check, is it a valid number to dial
            if (match !== null) {
                let contains_at_regex = /@/;
                let contains_at_in_dialstring = contains_at_regex.exec(event.Text);
                if (contains_at_in_dialstring !== null) {
                    Numbertodial = match[1];
                } else {
                    Numbertodial = match[1];
                    Numbertodial = Numbertodial + DIALPOSTFIX_URI; // Here we add the default hostname to the SIP number 
                }
                sleep(200).then(() => {
                    xapi.command("UserInterface Message TextInput Display", {
                        InputType: KEYBOARD_TYPES.PIN,
                        Placeholder: ('( %s )', bridgeInfo),
                        Title: bridgeInfo,
                        Text: 'SIP Dial number: ' + Numbertodial,
                        SubmitText: "Join",
                        FeedbackId: DIALHOSTPIN_ID
                    }).catch((error) => {
                        console.error(error);
                    });
                });
            } else {
                sleep(200).then(() => {
                    xapi.command("UserInterface Message Alert Display", {
                        Title: bridgeType,
                        Text: "Your entry was invalid. Please try again",
                    }).catch((error) => {
                        console.error(error);
                    });
                });
            }
            break;

        case DIALHOSTPIN_ID:
            if (isNaN(event.Text)) {
                sleep(200).then(() => {
                    xapi.command("UserInterface Message Alert Display", {
                        Title: bridgeType,
                        Text: "Your Hostpin was invalid.",
                    }).catch((error) => {
                        console.error(error);
                    });
                });
            }
            hostpin = event.Text;
            xapi.command("dial", {
                Number: Numbertodial //+ ',' + hostpin COMMENT OUT FOR NOW...
            }).catch((error) => {
                console.error(error);
            });
            break;
    }
});

xapi.status.on('Call CallbackNumber', (remoteNumber) => {
    if (remoteNumber.includes(Numbertodial)) {
        isInBridgeCall = 1;
        sleep(5000).then(() => {
            if (isInBridgeCall) { // need to check again in case call has dropped within the last 5 seconds
                if (hostpin.length > 0) {
                    xapi.command("Call DTMFSend", {
                        DTMFString: hostpin
                    });
                    if (!hostpin.includes('#')) {
                        xapi.command("Call DTMFSend", {
                            DTMFString: '#'
                        });
                    }
                } else {
                    xapi.command("Call DTMFSend", {
                        DTMFString: '#'
                    });
                }
            }
        });
    }
});

xapi.status.on('Call Status', (status) => {
    if (status.includes('Idle')) {
        Numbertodial = '';
    }
});