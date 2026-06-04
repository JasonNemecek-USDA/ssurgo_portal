# usecase2.py
# Use case 2: Open an existing template database (“ET”) in a folder that I select.

from dlcore.dlutilities import DlUtilities

class UseCase2:
	def isGeopackage(database, conn):
		# Checking of several SpatiaLite files shows an identifier of four null bytes.
		# For GeoPackage, geopackage decimal: 1196444487 / hex  0x47504b47   'GPKG'
		geopackage_identifier = 1196444487
		sql = 'PRAGMA application_id;' 

		cur = conn.cursor()
		cur.execute(sql)
		identifier = (cur.fetchone())[0]
		cur.close()

		return (identifier == geopackage_identifier)

	def isSpatiaLite(database, conn):
		# The SpatiaLite database is expected to have a "spatialite_history" table.
		cur = conn.cursor()
		sql = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='spatialite_history';"
		cur.execute(sql)
		tableCount = (cur.fetchone())[0]
		cur.close()
		return 1 == tableCount

	def getTableRecordCount(database, conn, tablename):
		# Get count from specified table
		cur = conn.cursor()
		sql = f"SELECT count(*) FROM {tablename};"
		cur.execute(sql)
		rowCount = (cur.fetchone())[0]
		cur.close()
		return rowCount		

	def openTemplate(request):
		# Use Case 2: openTemplate
		# Use case 2: Open an existing template database (“ET”) in a folder that I select.
		# Opens a SQLite file to confirm that it meets certain minimal criteria.
		# Use "<script> ?opentemplate" to retrieve schemas with request and response fields.

		database = request["database"]
		errormessage = ""
		message = ""
		databasetype = ""
		status = False
		conn = None
		try:
			# Can we connect to it?
			message = f'Unable to connect to database {database}'
			(status, conn, errormessage) = DlUtilities.create_connection(database)
			if not status:
				return {"status":status, "message": message, "errormessage":errormessage}

			# Can we identify it as a GeoPackage or SpatiaLie file?
			message = f"Unable to test file {database} for GeoPackage database type"
			isGeoPackageFile = UseCase2.isGeopackage(database, conn)
			message = f"Unable to test file {database} for SpatiaLite database type"
			isSpatiaLiteFile = UseCase2.isSpatiaLite(database, conn)
			if not isGeoPackageFile and not isSpatiaLiteFile:
				message = f"Unable to test file {database} for GeoPackage or SpatiaLite database type"
				return {"status":status, "message": message, "errormessage": errormessage}
			elif isGeoPackageFile and isSpatiaLiteFile:
				message = f"Logic error - file {database} reported as both GeoPackage and SpatiaLite database type"
				return {"status":status, "message": message, "errormessage": errormessage}
			elif isGeoPackageFile:
				databasetype = "GeoPackage"
			elif isSpatiaLiteFile:
				databasetype = "SpatiaLite"

			# Has the mdstatabs table been populated?
			tablename = 'mdstattabs'
			message = f"Unable to access table '{tablename}' within database '{database}'"
			rowcount = UseCase2.getTableRecordCount(database, conn, tablename)
			if rowcount < 1:
				message = "Checking for metadata table contents"
				errormessage = f"Zero row count in table '{tablename}' within database '{database}'"
				return {"status":False, "message": message, "errormessage": errormessage}

			# Can we report the number of rows in sacatalog?
			tablename = 'main.sacatalog'
			message = f"Unable to access table '{tablename}' within database '{database}'"
			rowcount = UseCase2.getTableRecordCount(database, conn, tablename)

			if conn:
				conn.close()

			status = True
			message = f"Database {database} accessed, type={databasetype}, #sacatalog records='{rowcount}"
			return {"status":status, "message": message, "errormessage": errormessage}

		except BaseException as err:
			if conn:
				conn.close()
			errormessage = format(err)
			return {"status":False, "message": message, "errormessage": errormessage}
