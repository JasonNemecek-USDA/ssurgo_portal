# usecase5.py

# Allow a conditional import test, this will only throw 
# an execption if environment has not been initialized.
# Developer note: we have to do this to allow the import of X06.
try:
    import osgeo
except:
    pass
from dlcore.dataloader import dataloader



class UseCase5:

    def pretestImportCandidates(request):
        # Use case 5a request: pretestImportCandidates
        # Use case 5: "Import one or more SSAs into an ET from a set of subfolders 
        # that I choose under a containing folder that I specify."
        # Perform a "pre-test" on one or more SSAs from a set of subfolders that I 
        # choose under a root folder.
        # Use "<script> ?pretestimportcandidates" to retrieve schemas with request and response fields.
        response = dataloader.pretestImportCandidates(request)
        return response

    def importCandidates(request):
        # Use case 5b request: importCandidates
        # Use case 5: "Import one or more SSAs into an ET from a set of subfolders 
        # that I choose under a containing folder that I specify."
        # Import one or more SSAs into a SSURGO SQLite database from a set of
        # subfolders that I choose under a root folder.
        # Use "<script> ?importcandidates" to retrieve schemas with request and response fields.
        response = dataloader.importCandidates(request)
        return response

    
    def importspatialdata(request):
        # Use case 5c request: importSpatialData
        # Use case 5: "Import one or more SSAs into an ET from a set of subfolders 
        # that I choose under a containing folder that I specify."
        # Import SSURGO spatial data from shapefiles under a specified path. 
        # Note that this activity is isolated to support its use in a child process.
        # Use "<script> ?importcandidates" to retrieve schemas with request and response fields.
        response = dataloader.importspatialdata(request)
        return response
    
    def generateRasters(request):
        response = dataloader.generateRasters(request)
        return response
    
    def getrecordlistbytable(request):
        response = dataloader.getrecordlistbytable(request)
        return response
    
    def getSDVAttributesByFolder(request):
        response = dataloader.getSDVAttributesByFolder(request)
        return response
    
    def getSDVRatingOptions(request):
        response = dataloader.getSDVRatingOptions(request)
        return response