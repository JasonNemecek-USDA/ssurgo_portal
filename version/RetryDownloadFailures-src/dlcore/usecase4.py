# usecase4.py

from dlcore.dlutilities import DlUtilities

class UseCase4:
    
    def deleteAreasymbols(request):
        # Use case 4 request: deleteAreasymbols
        # Use case 4: "Delete one or more SSAs within an ET."
        # Delete the specified areasymbols from the database.
        # Use "<script> ?deleteareasymbols" to retrieve schemas with request and response fields.
        
        database = request["database"]
        areasymbols = request["areasymbols"]
        errormessage = ""

        (status, conn, errormessage) = DlUtilities.create_connection(database)
        if not status:
            return {"status": status, "message": f"Unable to connect to database {database}"}

        for areasymbol in areasymbols:
            (status, message, errormessage) = DlUtilities.deleteAreasymbol(database, areasymbol, conn)
            if not status:
                if conn:
                    conn.close()
                return {"status": status, "message": "", "errormessage": errormessage}

        if conn:
            conn.close()
        return {"status": status, "message": "Removed areasymbols", "errormessage": errormessage}
