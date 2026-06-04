# usecase3.py
# Use case 3: View all loaded soil data (“Soil Survey Areas” (SSA), with “areasymbol”) within an ET.

import sqlite3

from dlcore.dlutilities import DlUtilities

class UseCase3:
    def getDatabaseInventory(request):
        # Use case 3 request: getDatabaseInventory
        # Use case 3: 'View all loaded soil data (“Soil Survey Areas” (SSA), with 
        # “areasymbol”) within an ET.'
        # List survey areas and related data within a SQLite database.
        # Use "<script> ?getdatabaseinventory" to retrieve schemas with request and response fields.
        database = request["database"]
        if "wheretext" in request:
            wheretext = request["wheretext"]
        else:
            wheretext = False

        (status, conn, errormessage) = DlUtilities.create_connection(database)
        if not status:
            response = {"status": False, "message" : f"Error connecting to database {database}", "errormessage": errormessage}
            return response

        sql = \
            'SELECT c.areasymbol, c.areaname, c.saverest, c.saversion,' \
                + 'CASE WHEN p.areasymbol ISNULL THEN 1 ELSE 0 END [istabularonly] ' \
                + 'FROM sacatalog [c] LEFT JOIN sapolygon [p] on c.areasymbol = p.areasymbol '
        if wheretext:
            sql += ' where ' + wheretext + ';'

        db_areasymbols_sql = '''select distinct areasymbol from legend'''



        try:
            cur = conn.cursor()
            cur.execute(sql)
            rows = cur.fetchall()

            records = {}
            for row in rows:
                records[row[0]] = {"areaname": row[1], "saverest": row[2], "saversion": row[3], "istabularonly": row[4] == 1}

            # Check to see if STATSGO, SSURGO or both exist in the database using areasymbols
            cur.execute(db_areasymbols_sql)
            results = cur.fetchall()
            db_areasymbols = [areasymbol[0] for areasymbol in results]
            dbstatus = 'EMPTY'
            if 'US' in db_areasymbols:
                if len(db_areasymbols) >= 2:
                    dbstatus = 'MIXED'
                else:
                    dbstatus = 'STATSGO2'
            elif db_areasymbols and 'US' not in db_areasymbols:
                dbstatus = 'SSURGO'            

            cur.close()
            conn.close()

            response = {"status": True, "message" : f"Data read from database {database}", "errormessage": "", "records": records, "dbstatus": dbstatus}
            return response
        except Exception as ex:
            response = {"status": True, "message" : f"Error reading from database {database}", "errormessage": format(ex)}

            return response
