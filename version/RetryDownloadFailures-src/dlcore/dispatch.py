# dispatch.py

import json
import time
import traceback

import config
from dlcore import usage
from dlcore.usage import Usage
from dlcore.dlutilities import DlUtilities
from dlcore.usecase1 import UseCase1
from dlcore.usecase2 import UseCase2
from dlcore.usecase3 import UseCase3
from dlcore.usecase4 import UseCase4
from dlcore.usecase5 import UseCase5
from dlcore.SSURGODownloader import BulkDownloader
import dlcore.SDVEngine as SDVEngine
from runmode import RunMode
from template_logger import tlogger

class Dispatch:

	@staticmethod
	def alive():
		return "Dispatch.alive() responded"

	def adjustResponseVerbosity(request,response):
		# Echo a de-serialized JSON response
		# and optionally include the request
		# and perform a schema check on the response.
		if request and request.get("verbose"):
			fullResponse = response
			# Perform schema check on response
			try:
				import dlcore.requestschema
				(status, errormessage) = dlcore.requestschema.parseResponse(request, fullResponse)
				if not status:
					fullResponse["status"] = False
					fullResponse["errormessage"] = errormessage
				# Add the original request to the response after schema checking.
				fullResponse["request"] = request					
			except:
				# We will initialize, this code will not be hit.
				pass
		else:
			fullResponse = {}
			keys = response.keys()
			for key in keys:
				if type(response[key]) != type('') or len(response[key]) > 0:
					fullResponse[key] = response[key]
	
		return fullResponse

	@staticmethod
	def getSyntaxAndCatalog():
		return (Usage.syntax, Usage.catalog)

	def unknownRequest(request):
		if "request" in request:
			errormessage = f"Request \"{request['request']}\" is undefined."
		else:
			errormessage = f"Request does not contain a value for \"request\"."

		response = {"status": False, "message": "Unknown request", "errormessage":errormessage}
		return response

	def dispatch(request):
		# Dispatch to request handler for each kind of request.
		# Request names are treated in a case-blind fashion, they are mapped 
		# to lower-case.

		# Note that the requestschema depends upon jsonschema.
		# We perform a dummy try/except import to allow for 
		# initialization.

		requestKey = ""
		try:
			# A null request is treated as a request for usage plus the catalog.
			# We'll let "main" sort out its display.
			if not request or not isinstance(request, dict):
				# case: no formal request, return usage and catalog
				request = Usage.generalUsageRequest

			# Key tests should all be lower case
			requestKey = (request["request"]).lower()
			tlogger.info(f'dispatch called with requestKey={requestKey} in {format(config.get("runmode"))}, next log record contains JSON request.')
			fullRequest = json.dumps(request)
			if requestKey == "logjavascripterror":
				tlogger.error(fullRequest)
			else:
				tlogger.info(fullRequest)
			# Optional check of SSURGO Portal UI requests
			# The DP calls dispatch directly, it does not go through __main__.
			if RunMode.SSURGO_PORTAL_UI == config.get("runmode"):
				start_time = time.time()
				if config.get("checkDpRequestsAgainstSchema"):
					try:
						import dlcore.requestschema
						(status, requestObject, errormessage) = dlcore.requestschema.parseRequest(request)
					except:
						# We will initialize, this code will not be hit.
						pass

					if not status:
						message = f'DP request={requestKey} failed schema check.'
						response = {"status": False, "message": message, "errormessage": errormessage, "elapsedseconds": 0}
						return Dispatch.adjustResponseVerbosity(request, response)

			# General utility requests
			if "getusage" == requestKey:
				response = usage.Usage.getUsage(request)
			elif "getstatus" == requestKey:
				response = DlUtilities.getStatus()
			elif "getwindowsdriveletters" == requestKey:
				response = DlUtilities.getWindowsDriveLetters()
			elif "getfoldertree" == requestKey:
				response = DlUtilities.getFolderTree(request)

			# Use Case 1 requests
			elif "gettemplatecatalog" == requestKey:
				response = UseCase1.getTemplateCatalog()
			elif "copytemplatefile" == requestKey:
				response = UseCase1.copyTemplateFile(request)

			# Use Case 2 requests
			elif "opentemplate" == requestKey:
				response = UseCase2.openTemplate(request)

			# Use Case 3 requests
			elif "getdatabaseinventory" == requestKey:
				response = UseCase3.getDatabaseInventory(request)

			# Use Case 4 requests
			elif "deleteareasymbols" == requestKey:
				response = UseCase4.deleteAreasymbols(request)

			# Use Case 5 requests
			elif "pretestimportcandidates"  == requestKey:
				response = UseCase5.pretestImportCandidates(request)
			elif "importcandidates"  == requestKey:
				response = UseCase5.importCandidates(request)
			elif "importspatialdata" == requestKey:
				# Note: only intended for subbprocess use
				response = UseCase5.importspatialdata(request)
			elif "getrecordlistbytable" == requestKey:
				response = UseCase5.getrecordlistbytable(request)
			elif "getsdvattributesbyfolder" == requestKey:
				response = UseCase5.getSDVAttributesByFolder(request)
			elif "getsdvratingoptions" == requestKey:
				response = UseCase5.getSDVRatingOptions(request)
			elif "generaterasters" == requestKey:
				response = UseCase5.generateRasters(request)
			elif "logjavascripterror" == requestKey:
				return {"status": True, "message": "JavaScript Error was logged"}

			# Bulk Downloader requests
			elif "bulkssadownload" == requestKey:
				downloader = BulkDownloader(request)
				response = downloader.bulkDownload()
			elif "deleteunfinisheddownloads" == requestKey:
				downloader = BulkDownloader(request)
				response = downloader.deleteUnfinishedDownloads()

			#SDVEngine requests
			elif "generateaggregation" == requestKey:
				response =  SDVEngine.runAggregation(request)
			
			else:
				response = Dispatch.unknownRequest(request)
			# Capture elapsed time for DP mode
			if RunMode.SSURGO_PORTAL_UI == config.get("runmode"):
				end_time = time.time()
				time_elapsed = (end_time - start_time)
				response["elapsedseconds"] = round(time_elapsed)
				
			# Tweak response for specified verbosity
			fullResponse = Dispatch.adjustResponseVerbosity(request, response)
			if fullResponse["status"]:
				tlogger.info(f'Request {requestKey} was successful')
			else:
				tlogger.error(f'Error in request {requestKey}, errormessage="{fullResponse["errormessage"]}"')

			return fullResponse
		except Exception as err:
			requestKey
			errormessage = f'dispatch(request) unhandled exception trap for requestKey={requestKey}, error: {format(err)}'
			tlogger.critical(errormessage)
			tlogger.critical(traceback.format_exc())
			response = {"status":False, "errormessage": errormessage}
			return response
