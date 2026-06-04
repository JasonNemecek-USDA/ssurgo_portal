# dlcore\usage.py

import json
from template_logger import tlogger

class Usage:
    generalUsageRequest = {"request":"getusage"}

    # The command-line syntax, as a plain string.
    syntax = '''
If executed at a command prompt, the DP/DL behavior may be selected by 
choosing one  of the following forms, where "<script>" is the name of 
the Python script that you are currently running:
  <script>
       - start SSURGO Portal UI
  <script> ?requestName   (or any text starting with a character other than "@")
       - If requestame is omitted then return pretty-printed usage syntax plus 
         a list of the available request names.
       - if the "?" is immediately followed by the name of a JSON request, 
        the request and response schemas are presented for that request,
        if the request name is invalid an error is shown. For example,
          <script> ?getstatus
  <script> @x01.txt
		- read DL input from x01.txt 
  <script> @ < x01.txt
		- read file x01.txt via STDIN 
  type x01.txt | <script> @
		- read piped-in (i.e., stdin) text from x01.txt
  <script> -debugbrowser "command"
        - Allow the UI to open up in a user defined browser instance. 
          Mainly used for UI automated testing.
        - example "command": "C:\Program Files/Google/Chrome/Application/chrome.exe 
          http://localhost:8083/startUp --remote-debugging-port=9222 --user-data-dir=C:\chromeData"

Note that the JSON requests and responses may include "comment" 
items. These are for documentation purposes and are ignored by this script. 
The names of the requests are handled in a case-blind manner.
In general empty response items are omitted (unless verbose is set true).

The simplest JSON request looks like this:
    {
      "request": "getstatus"
    }
and the response will be similar to:
    {
        'status': True, 
        'message': "It's alive! 
            runmode=RunMode.DATA_LOADER, 
            isPyz=False, __file__=C:\\ notes\\2022\\05\\Gaia-1882\\pyz\\dlcore\\dlutilities.py, 
            currentPath=C:\\ notes\\2022\\05\\Gaia-1882\\pyz",
        'errormessage': ""
    }
'''
    def jsonPrettyPrint(theObject):
        return json.dumps(theObject, indent=2).replace('\\n', '\r\n')

    def getUsage(request):
        requestNameParameter = "inquireabout"
        response = {"status":True}

        try:
            import dlcore.requestschema
            if  requestNameParameter in request \
                    and request[requestNameParameter] in dlcore.requestschema.schemaDictionary:
                requestName = request[requestNameParameter]
                schema = dlcore.requestschema.schemaDictionary[requestName]
                payload = f"Request schema for {requestName}: \n" + \
                    Usage.jsonPrettyPrint(schema["request"]) + "\n" + \
                    f"Response schema for {requestName}: \n " + \
                    Usage.jsonPrettyPrint(schema["response"])
            else:
                # Payload consists of the usage syntax plus a list of the request names.
                payload = Usage.syntax + '\nAvailable request names:\n  ' + \
                    '\n  '.join(list(dlcore.requestschema.schemaDictionary.keys()))
            response["payload"] = payload
            return response
        except:
            # Dummy try/except - we need to initialize.
            message = 'getUsage "import dlcore.requestschema" failed - prior initialization should have occurred'
            tlogger.critical(message)
            response["payload"] = message
            return response


