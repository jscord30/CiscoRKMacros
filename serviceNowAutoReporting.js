/**********************************************************
PROGRAM HEADER
STANFORD HEALTH CARE - Technology & Digital Solutions
Programmer: Justin Scord
Last Modified Date: 2022-Dec-05
**********************************************************/
const BUILD_VERSION= "1.1.9"; //Version Control 

const xapi = require('xapi');
const SERVICE_NOW_INSTANCE_URL = 'stanfordhc.service-now.com'; // Specify a URL to a service like serviceNow etc.
const MONITORING_URL = 'https://' + SERVICE_NOW_INSTANCE_URL + '/api/now/v1/table/incident'; // Specify a URL to a service like serviceNow etc.
const CHECKUSER_URL = 'https://' + SERVICE_NOW_INSTANCE_URL + '/api/now/table/sys_user?sysparm_query=user_name=';
const CHECKDUPLICATE_URL = 'https://' + SERVICE_NOW_INSTANCE_URL + '/api/now/table/incident?sysparm_query=incident_state!=7&short_description=';
const CONTENT_TYPE = "Content-Type: application/json";
const SERVICENOW_USERNAMEPWD_BASE64 = 'Y2lzY29fdGVsZXByZXNlbmNlOlN0YW5mb3JkQDEyMw=='; // format is  "username:password" for basic Authorization. This needs to be base64-encoded. Use e.g. https://www.base64encode.org/ to do this
const SERVICENOW_AUTHTOKEN = "Authorization: Basic " + SERVICENOW_USERNAMEPWD_BASE64;
const SHOWENDUSERTICKETNUMBER = false; //true will have the Incident number appear on the on screen display and touch panel.
const TIMEOUT = 300000; // 300000 = 5 mins - Sets delay for tickets to generate

var messageID;
var userSID;
var userPhoneNumber;
var userFullName;
var ticketTimer = {
    controlSystemDisconnected : '',
    displayDisconnected : ''
};
var systemInfo = {
    softwareVersion : '',
    systemName : '',
    softwareReleaseDate : '',
    ipAddress : '',
	macroVersion : BUILD_VERSION
};

function working(text){
  if (SHOWENDUSERTICKETNUMBER == true){
    xapi.command("UserInterface Message Alert Display", {
      Title: 'Working...',
      Text: text,
      Duration: 10
    }).catch((error) => {console.error(error);});
  }
}

function checkForDuplicate(short_description){
  var URI = encodeURIComponent(short_description);
  console.debug(URI);
  return xapi.command('HttpClient GET', {
      'Header': [SERVICENOW_AUTHTOKEN, CONTENT_TYPE],
      'Url': CHECKDUPLICATE_URL + URI,
      'AllowInsecureHTTPS': 'False'
  })
}

function buildTicket(func_userName){
  xapi.command("UserInterface Message Prompt Display", {
    Title: "Thanks " + func_userName +"!",
          Text: 'Please select what the problem area is',
          FeedbackId: 'roomfeedback_step1',
          'Option.1':'Cable Management',
          'Option.2':'Audiovisual',
          'Option.3': 'Other',
        }).catch((error) => { console.error(error); });
}

function sendMonitoringUpdatePost(message){
  console.log('Message sendMonitoringUpdatePost: ' + message);
  var messagecontent = {
    description: systemInfo.softwareVersion,
    short_description: systemInfo.systemName + ': ' + message
  };
    xapi.command('HttpClient Post', {'Header': [SERVICENOW_AUTHTOKEN, CONTENT_TYPE]  , 'Url':MONITORING_URL , 'AllowInsecureHTTPS': 'False'}, JSON.stringify(messagecontent));
}

function getServiceNowIncidentIdFromURL(url){

    return xapi.command('HttpClient Get', { 'Header': [CONTENT_TYPE, SERVICENOW_AUTHTOKEN] , 'Url':url, 'AllowInsecureHTTPS': 'False'});
}

function SIDCheck(SID){
    if(SID.match(/^[sS][0-9]{7}$/) !== null){
      return true;
    }
    else if(SID === ""){
      return true;
    }
    else{
      return false;
    }
}
function raiseTicket(message, assignment_group, business_service, configItem, category){
  
  console.log('Message raiseTicket: ' + message);
  
  assignment_group = typeof assignment_group !== 'undefined' ? assignment_group : "Collaboration & Media Services - Operations";
  business_service = typeof business_service !== 'undefined' ? business_service : "Communications";
  configItem = typeof configItem !== 'undefined' ? configItem : "AV Services";
  category = typeof category !== 'undefined' ? category : "Infrastructure";
  
  var description;
  if(message == 'undefined'){
    throw 'Message is undefined. There must be a valid entry to complete this request.';
  }
  else if(message.length > 170){
    description = "Reported by AV system for user: " + userSID + " | " + userFullName + "\n \n" + message;
    message = "There is a user reported issue in " + systemInfo.systemName;
  }
  else {
    description = "Reported by AV system for user: " + userSID + " " + userFullName + "\nDevice IP Address: " + systemInfo.ipAddress + "\nSoftware Version: " + systemInfo.softwareVersion + "\nMacro Version: " + systemInfo.macroVersion;
  }
  var messagecontent = {
    "short_description": message,
    "impact":"3",
    "urgency":"3",
    "assignment_group": assignment_group,
    "u_business_service": business_service,
    "cmdb_ci":configItem,
    "category":category,
    "u_location_details": systemInfo.systemName,
    "contact_type":"System Generated",
    "caller_id": userFullName,
    "u_callback_number": userPhoneNumber,
    "description": description,
    "sysparm_input_display_value": "True"
  };
  working("Please wait while we fetch your ticket number.");

  //Query's Incident Table For Duplicates then opens the ticket.
  checkForDuplicate(message).then((result) => {

    var body = JSON.parse(result.Body).result;
    console.debug('Got this from checkForDuplicate: ' + body);

    if (body == '') {
      console.debug('Ticket Duplicate Not Found');

      //This block of stuff posts the incident to ServiceNow and Returns the Ticket #
      xapi.command('HttpClient Post', { 'Header': [CONTENT_TYPE, SERVICENOW_AUTHTOKEN] , 'Url':MONITORING_URL, 'AllowInsecureHTTPS': 'False'}
      , JSON.stringify(messagecontent)).then((result) => {
        const serviceNowIncidentLocation = result.Headers.find(x => x.Key === 'Location');
        var serviceNowIncidentURL = serviceNowIncidentLocation.Value;
        var  serviceNowIncidentTicket;
        getServiceNowIncidentIdFromURL(serviceNowIncidentURL).then(
        (result) => {
          var body = result.Body;
          console.log('Got this from getServiceNowIncidentIdFromURL: ' + JSON.stringify(result));
          serviceNowIncidentTicket =  JSON.parse(body).result.number;
          console.log("ServiceNow Incident Number: " + serviceNowIncidentTicket);
          if (SHOWENDUSERTICKETNUMBER == true){
            xapi.command("UserInterface Message Alert Display", {
              Title: 'Technology and Digital Soluions Receipt',
              Text:  'Your ticket number is ' + serviceNowIncidentTicket + ". We're on the case!",
              Duration: 10
              }).catch((error) => { console.error(error);});
          }
        });
        console.log('Got this from raiseTicket: ' + JSON.stringify(result));
      });
    }
    else {
      console.debug('Ticket Duplicate Found!');
    }
  })
}

//automated ticket generation
xapi.status.on('Diagnostics Message', (error) => {
  
  console.log(JSON.stringify(error));

  // clears diagnostic messages
  if(messageID == error.id && error.ghost == "True"){
    clearTimeout(ticketTimer.controlSystemDisconnected);
  }

	switch(error.Level){
		case 'Error':
      if(error.Type == "ControlSystemConnection"){
        ticketTimer.controlSystemDisconnected = setTimeout(raiseTicket, 18000000, systemInfo.systemName + ' ' + error.Description)
        messageID = error.id;
        break;
      }
      else if (error.Description == "Unable to decode the incoming video signal. Cable may be too long or damaged.") {
        console.log(systemInfo.systemName + ' ' + error);
        break;
      }
			else{
        raiseTicket(systemInfo.systemName + ' ' + error.Description);
        break;
      }

		case 'Critical':
			raiseTicket(systemInfo.systemName + ' ' + error.Description);
			break;
		case 'Warning':
			if(error.Type == 'CameraDetected'){
				raiseTicket(systemInfo.systemName + ' ' + error.Description);
			}
			/*
			if(error.Type == 'MicrophoneOverloaded'){
				raiseTicket(systemInfo.systemName + ' ' + error.Description);
			}
			*/
			break;
	}	
});


/*
//Checks that Output display is not disconnected or manually powered off
xapi.status.on('Video Output', (data) => {
  var connectorObj = data.Connector[0];
  console.log('Received from Video Connector Event Listener: ' + JSON.stringify(connectorObj));
  if (connectorObj.Connected == 'False') {
    ticketTimer.displayDisconnected = setTimeout(raiseTicket, TIMEOUT, systemInfo.systemName + ' Display is showing as Disconnected on Output Connector ' + connectorObj.id);
  }
  if (connectorObj.Connected == 'True') {
      clearTimeout(ticketTimer.displayDisconnected);
      console.debug('Ticket Generation Canceled');
  }
});
*/

function init(){
  xapi.status.get('SystemUnit Software Version').then((value) => {
    systemInfo.softwareVersion = value;
  });
  xapi.config.get('SystemUnit Name').then((value) => {
    if(value === ''){
      xapi.status.get('SystemUnit Hardware Module SerialNumber').then((value) => {
        systemInfo.systemName = value;
      });
    }
    else{
      systemInfo.systemName = value;
    }
  });
  xapi.status.get('SystemUnit Software ReleaseDate').then((value) => {
    systemInfo.softwareReleaseDate = value;
  });
  xapi.status.get('Network 1 IPv4').then((value) => {
    systemInfo.ipAddress = value.Address;
  });
  xapi.config.set('HttpClient Mode', 'On');
}

init();