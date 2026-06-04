from dlcore.dataloader import dataloader
from dlcore.dlutilities import DlUtilities
from template_logger import tlogger
from json import loads
import sqlite3

from datetime import datetime
from decimal import getcontext, Decimal, ROUND_HALF_UP
import config
disableMukeyWhereClause = config.get("disableMukeyWhereClause")
timeTrials = config.get("enableTimeTrials")
try:
    import pandas as pd
except Exception as ex:
    pass
else:
    def runAggregation(request):
        databaseLocation = request["database"]
        aggregationRules = request["aggregationrules"]
        aggregationParameters = request["aggregationparameters"]
        try:
            if timeTrials:
                startTime = datetime.now()
            aggregationRules = sanitizeStrings(aggregationRules)
            aggregationParameters = sanitizeStrings(aggregationParameters)
            frame = fetchData(databaseLocation, aggregationRules, aggregationParameters)
            frame = initiallyAggregateData(frame, aggregationRules, aggregationParameters)
            frame = reduceMultiples(frame, aggregationRules, aggregationParameters)
            if aggregationParameters['interpretnullsaszero']: frame = convertNullsToZeros(frame)
            frame = aggregateData(frame, aggregationRules, aggregationParameters)
            frame, reasons = finishForDisplay(frame, aggregationRules, aggregationParameters, databaseLocation)
            tablename = generateRatingTable(frame, aggregationRules, aggregationParameters, databaseLocation, reasons)
            message = f"""The results of your rating have been saved to the <strong>{tablename}</strong> table and was added to 
            your database. To create maps in GIS, join this table with the <strong>mupolygon</strong> table or the 
            <strong>muraster</strong> GeoTiff on the <strong>mukey</strong> column. The <strong>mupolygon</strong> is a vector 
            representation of the soil polygons and is stored within the database. The <strong>muraster</strong> is the rasterized 
            version of the soil polygons and is saved in the same folder as your database."""
            #Drop columns that are not needed for the response.
            frame.drop(['mukey', 'areaname'], axis='columns', inplace=True)
            frameJson = frame.to_json(orient="records")
            frameJson = loads(frameJson.replace("NaN,", "null,"))
            if timeTrials:
                endTime = datetime.now()
                print("Total Time: " + str(endTime-startTime))
            return {"status": True, "message": message, "tablename": tablename, "frame" : frameJson}
        except Exception as ex:
            raise Exception("Unable to perform aggregation: " + str(ex))
    
    def fetchData(databaseLocation: str, aggregationRules: dict, aggregationParameters: dict) -> pd.DataFrame:
        """Method based out of SDV to build out a query to perform aggregation logic. Place the query results into a pandas dataframe"""

        primarywhere = ""
        unionquery = ""
        attributetable = aggregationRules["attributetablename"]
        attributecolumn = aggregationRules["attributecolumnname"]
        ruletype = aggregationRules["attributetype"]
        ruledesign = aggregationRules["ruledesign"]
        tiebreakdomain = aggregationRules["tiebreakdomainname"]
        componentlevel = aggregationRules["complevelattribflag"]
        attributetype = aggregationRules["attributelogicaldatatype"]
        sqlwhereclause = aggregationRules["sqlwhereclause"]
        nasisrulename = aggregationRules["nasisrulename"]
        primarycolumn = aggregationRules["primaryconcolname"]
        primarytype = aggregationRules["pcclogicaldatatype"]
        secondarycolumn = aggregationRules["secondaryconcolname"]
        secondarytype = aggregationRules["scclogicaldatatype"]
        compmonthlevel = aggregationRules["cmonthlevelattribflag"]
        horizonlevel = aggregationRules["horzlevelattribflag"]
        
        #Convert in to cm
        if aggregationParameters['depthuom'] == 'in':
            aggregationParameters['inchtop'] = aggregationParameters['depthtop']
            aggregationParameters['inchbot'] = aggregationParameters['depthbot']
            aggregationParameters['depthbot'] = round(aggregationParameters['depthbot'] * 2.54)
            aggregationParameters['depthtop'] = round(aggregationParameters['depthtop'] * 2.54)

        (status, conn, errorMessage) = DlUtilities.create_connection(databaseLocation)
        if not status:
            if errorMessage[-9::] == "not found":
                raise FileNotFoundError(errorMessage)
            return {"status": status, "message": f"Unable to connect to database {databaseLocation}"}
        rawRelationsQuery = f'''
            select ltabphyname, rtabphyname, ltabcolphyname, rtabcolphyname from mdstatrshipdet'''
        dbRelationsCursor = conn.cursor()
        dbRelationsCursor.execute(rawRelationsQuery)
        rshipdetailRows = dbRelationsCursor.fetchall()
        conn.close()
        rshipdetailcolumns = [d[0] for d in dbRelationsCursor.description]
        rshipdetailRecords = [dict(zip(rshipdetailcolumns, rshipdetailRow)) for rshipdetailRow in rshipdetailRows]
        (sqlRelations) = dataloader.getDBChildRelationsSQL(rshipdetailRecords, dict(), "mapunit", "", "", "", "")

        at = sqlRelations[attributetable]

        if not disableMukeyWhereClause:
            getmulistquery = "SELECT mukey FROM mapunit"
            (status, conn, errorMessage) = DlUtilities.create_connection(databaseLocation)
            db = conn.cursor()
            mulist = db.execute(getmulistquery).fetchall()
            conn.close()

        interpstable = "cointerp"
        mapunitkey = "mapunit.mukey"
        componentkey = "component.cokey"
        componentfkey = "cokey"
        choicecolumn = "choice"
        muSelect = 'select legend.areasymbol, legend.areaname, sacatalog.saversion, sacatalog.saverest, mapunit.mukey, mapunit.musym, null as nationalmusym, mapunit.muname, '
        #Removed as SYSTEM Tables are not in the template databases
        #muSelect +=	'(select museq from [SYSTEM - Mapunit Sort Specifications] mss where mss.lkey=legend.lkey and mss.mukey=mapunit.mukey) as museq, ' 
        muFrom = " from sacatalog, legend, mapunit"
        muWhere = " where sacatalog.areasymbol=legend.areasymbol and mapunit.lkey=legend.lkey"

        if attributetable == "cointerp":
            attributetable = interpstable

        attrFrom = None
        attrWhere = None
        fromnode = at['From']
        wherenode = at['Where']
        if fromnode is not None and wherenode is not None:
            attrFrom = str(fromnode)
            attrWhere = str(wherenode)
        else:
            raise AttributeError("Unrecognized attribute table: " + attributetable)
        
        #--------------------------------------------------------------------------------------------------------
        # Select clause additions for attribute, constraints and tiebreakers
        #--------------------------------------------------------------------------------------------------------
        
        if attributetype == "vtext":
            attribute = "substr(" + attributetable + "." + attributecolumn + ", 1, 255)"
        elif ruletype == "interpretation" and aggregationParameters["aggregationmethod"] == "weighted average":
            attribute = interpstable + ".interphr"
        else:
            attribute = attributetable + "." + attributecolumn

        nullconstraints = ", null as primaryconstraint, null as secondaryconstraint"
        if primarycolumn is not None:
            constraints = ", " + attributetable + "." + primarycolumn + " as primaryconstraint"
            constraints += ", " + ( attributetable + "." + secondarycolumn if secondarycolumn is not None else "null") + " as secondaryconstraint"
        else:
            constraints = nullconstraints

        #Not sure what tiebreaktype is used for. Even in SDV, intellisense is showing it as unused.
        if ruletype == "interpretation" and (ruledesign == 1 or ruledesign == 2):
            tiebreak = interpstable + ".interphr"
            tiebreaktype = "float"

        elif tiebreakdomain is not None: 
            tiebreak = "(select choicesequence from mdstatdomdet where domainname = '" + tiebreakdomain + "' and " + choicecolumn + " = " + attributetable + "." + attributecolumn + ")"
            tiebreaktype = "integer" 
        else:
            tiebreak = attribute
            tiebreaktype = attributetype
        
        select = muSelect + attribute + " as attributevalue, " + tiebreak + " as tiebreakvalue" + constraints
        if componentlevel: 
            select += ", " + componentkey + " as cokey, component.compname, component.comppct_r"
            if ruletype == "interpretation" and (ruledesign == 1 or ruledesign == 2):
                select += ", " + interpstable + ".interphr"
            if attributetable == "chorizon" and (attributetype == "integer" or attributetype == "float"):
                select += ", chorizon.hzdept_r, chorizon.hzdepb_r"
                if aggregationParameters["layers"] == "all layers":
                    select += ", (select min(hzdept_r) from chorizon where chorizon." + componentfkey + " = " + componentkey 
                    select += " and " + attributetable + "." + attributecolumn + " is not null and hzdept_r is not null and hzdepb_r is not null) as actualdepthtop"

                    select += ", (select max(hzdepb_r) from chorizon where chorizon." + componentfkey + " = " + componentkey 
                    select += " and " + attributetable + "." + attributecolumn + " is not null and hzdept_r is not null and hzdepb_r is not null) as actualdepthbot"

                elif aggregationParameters["layers"] == "depth range":
                    select += ", (select min(hzdept_r) from chorizon where chorizon." + componentfkey + " = " + componentkey 
                    select += " and " + attributetable + "." + attributecolumn + " is not null and hzdept_r is not null and hzdepb_r is not null and hzdept_r < " 
                    select += str(aggregationParameters["depthbot"]) + " and hzdepb_r > " + str(aggregationParameters["depthtop"]) + ") as actualdepthtop"

                    select += ", (select max(hzdepb_r) from chorizon where chorizon." + componentfkey + " = " + componentkey 
                    select += " and " + attributetable + "." + attributecolumn + " is not null and hzdept_r is not null and hzdepb_r is not null and hzdept_r < " 
                    select += str(aggregationParameters["depthbot"]) + " and hzdepb_r > " + str(aggregationParameters["depthtop"]) + ") as actualdepthbot"
                else: #aggregationParameters.Layers == "surface layer"
                    select += ", (select min(hzdept_r) from chorizon where chorizon." + componentfkey + " = " + componentkey + " and " 
                    select += attributetable + "." + attributecolumn + " is not null and hzdept_r = 0 and hzdepb_r is not null) as actualdepthtop"

                    select += ", (select max(hzdepb_r) from chorizon where chorizon." + componentfkey + " = " + componentkey + " and "
                    select += attributetable + "." + attributecolumn + " is not null and hzdept_r = 0 and hzdepb_r is not null) as actualdepthbot"

        #--------------------------------------------------------------------------------------------------------
        # Where clause additional conditions
        #--------------------------------------------------------------------------------------------------------

        where = muWhere + ("" if attrWhere is None or attrWhere == "" else " and " + attrWhere )
        if not disableMukeyWhereClause:
            if len(mulist) > 0:
                where += " and " + mapunitkey + " in (" + getmulistquery + ")"
        if (sqlwhereclause is not None and sqlwhereclause != ""):
            #Currently there is a discrepancy in the casing between what is coming in from upstream and what is stored in the database
            #To resolve this in the interim, we are going to have every compare done in lowercase.
            sqlwhereclause = str(sqlwhereclause)
            sqlwhereclause = "lower(" + sqlwhereclause
            if sqlwhereclause.__contains__("="):                
                sqlwhereclause = sqlwhereclause.replace("='", ")=lower('").replace("= '", ")=lower('")
                sqlwhereclause = sqlwhereclause.replace(" or ", " or lower(").replace("lower((", "(lower(")
                sqlwhereclause = sqlwhereclause.replace("'", "')").replace("lower(')", "lower('")
            elif sqlwhereclause.__contains__(" in "):
                sqlwhereclause = sqlwhereclause.replace(" in ", ") in (")
                sqlwhereclause = sqlwhereclause.replace("('", "lower('").replace(", '", ", lower('")
                sqlwhereclause = sqlwhereclause.replace("'", "')").replace("lower(')", "lower('")
            else:
                raise ValueError("sqlwhereclause contains unexpected string: " + sqlwhereclause)
            where += " and " + sqlwhereclause
        if (nasisrulename is not None and nasisrulename != ""):
            where += " and " + interpstable + ".mrulename = '" + nasisrulename + "' and " + interpstable + ".ruledepth = 0"
        if (primarycolumn is not None and primarycolumn != ""):
            where += " and ("
            qp = "" if (primarytype == "integer" or primarytype == "float") else "'"
            qs = "" if (secondarytype == "integer" or secondarytype == "float") else "'"

            #Convert contraints into a list if not already and not None.
            if type(aggregationParameters["primaryconstraint"]) == str and (type(aggregationParameters["primaryconstraint"]) is not None or aggregationParameters["primaryconstraint"] != ""):
                aggrParam = [aggregationParameters["primaryconstraint"]]  
            if type(aggregationParameters["secondaryconstraint"]) == str and (type(aggregationParameters["secondaryconstraint"]) is not None or aggregationParameters["secondaryconstraint"] != ""):
                secAggrParam = [aggregationParameters["secondaryconstraint"]]
            for idx, primeConstraint in enumerate(aggrParam):
                if idx > 0:
                    where += " or "
                primarywhere = attributetable + "." + primarycolumn + "=" + qp + primeConstraint + qp
                if (secondarycolumn is not None and secondarycolumn != ""):
                    where += "(" + primarywhere + " and " + attributetable + "." + secondarycolumn + "=" 
                    where += qs + secAggrParam[idx] + qs + ")"
                else:
                    where += primarywhere
            where += ")"
        if componentlevel and not fetchAllComps(aggregationParameters):
            where += " and component.comppct_r is not null and component.comppct_r > 0"
            if aggregationParameters["componentpercentagecutoff"] is not None:
                where += " and component.comppct_r >= " + str(aggregationParameters["componentpercentagecutoff"])
        if compmonthlevel:
            mb = monthSequence(aggregationParameters["monthbeg"])
            me = monthSequence(aggregationParameters["monthend"])
            monthcolumn =  "comonth.monthseq"
            if mb == me:
                where += " and " + monthcolumn + " = " + str(mb)
            elif mb < me:
                where += " and " + monthcolumn + " >= " + str(mb) + " and " + monthcolumn + " <= " + str(me)
            elif mb > me:
                where += " and (" + monthcolumn + " >= " + str(mb) + " or " + monthcolumn + " <= " + str(me) + ")"
        if horizonlevel:
            if aggregationParameters["layers"] == "surface layer":
                where += " and chorizon.hzdept_r = 0"
            elif aggregationParameters["layers"] == "depth range":
                where += " and chorizon.hzdept_r < " + str(aggregationParameters["depthbot"]) + " and hzdepb_r > " + str(aggregationParameters["depthtop"])
            if (attributetable == "chorizon" and (attributetype == "integer" or attributetype == "float") and aggregationParameters["layers"] != "surface layer"):
                where += " and " + attributetable + "." + attributecolumn + " is not null and chorizon.hzdept_r is not null and chorizon.hzdepb_r is not null"

        #--------------------------------------------------------------------------------------------------------
        # Put it all together.
        #--------------------------------------------------------------------------------------------------------

        query = select + muFrom + ("" if len(attrFrom) == 0 else ", " + attrFrom) + where

        #--------------------------------------------------------------------------------------------------------
        # Add back any missing components that may be needed in the aggregation.
        #--------------------------------------------------------------------------------------------------------

        if componentlevel and (aggregationParameters["interpretnullsaszero"] 
                                    or aggregationParameters["aggregationmethod"] == "dominant component" 
                                    or aggregationParameters["aggregationmethod"] == "dominant condition"):
            union = " union " + muSelect + "null as attributevalue, null as tiebreakvalue" + nullconstraints + ", " + componentkey + ", component.compname, component.comppct_r"
            if ruletype == "interpretation" and (ruledesign == 1 or ruledesign == 2):
                union += ", null as interphr"
            if attributetable == "chorizon" and (attributetype == "integer" or attributetype == "float"):
                union += ", null as hzdept_r, null as hzdepb_r, null as actualdepthtop, null as actualdepthbot"
            union += muFrom + ", component" + muWhere + " and component.mukey=mapunit.mukey"
            if not disableMukeyWhereClause:
                if len(mulist) > 0:
                    union += " and " + mapunitkey + " in (" + getmulistquery + ")"
            if not fetchAllComps(aggregationParameters):
                union += " and component.comppct_r is not null and component.comppct_r > 0"
                if aggregationParameters["componentpercentagecutoff"] is not None: 
                    union += " and component.comppct_r >= " + str(aggregationParameters["componentpercentagecutoff"])
            union += " and " + componentkey   + " not in (select " + componentkey + muFrom
            union += ("" if len(attrFrom) == 0 else ", " + attrFrom) + where + ")"

            union += " and " + mapunitkey + " in (select " + mapunitkey + muFrom + ", " + attrFrom + where + ")"
            unionquery += union

        #--------------------------------------------------------------------------------------------------------
        # Add back any missing mapunits.
        #--------------------------------------------------------------------------------------------------------
            
        union = " union " + muSelect + "null as attributevalue, null as tiebreakvalue" + nullconstraints
        if componentlevel:
            union += ", null as cokey, null as compname, null as comppct_r"
            if ruletype == "interpretation" and (ruledesign == 1 or ruledesign == 2):
                union += ", null as interphr"
            if attributetable == "chorizon" and (attributetype == "integer" or attributetype == "float"):
                union += ", null as hzdept_r, null as hzdepb_r, null as actualdepthtop, null as actualdepthbot"
            union += muFrom
            union += muWhere
            if not disableMukeyWhereClause:
                if len(mulist) > 0:
                    union += " and " + mapunitkey + " in (" + getmulistquery + ")"
            union += " and " + mapunitkey + " not in (select " 
            union += mapunitkey  + muFrom  + ("" if attrFrom == "" or attrFrom is None else ", " + attrFrom)
            union += where + ")"
            unionquery += union

        #--------------------------------------------------------------------------------------------------------
        # Order By clause.
            # Note: In SDV the order by clause uses a table called SYSTEM - Mapunit Sort Specifications. This is 
            # logic that creates a custom sort order. For now we use ORDER BY areasymbol, musym. 
            # Down the road we will want to include logic to mimic the museq from the SYSTEM - Mapunit Sort Specifications
        #--------------------------------------------------------------------------------------------------------

        unionquery += " order by legend.areasymbol, mapunit.musym" #, museq"
        
        (status, conn, errorMessage) = DlUtilities.create_connection(databaseLocation)
        if not status:
            return {"status": status, "message": f"Unable to connect to database {databaseLocation}"}

        conn.row_factory = sqlite3.Row
        db = conn.cursor()
        frame = pd.read_sql_query(query + unionquery, conn)
        conn.close()
        frame["rating"] = pd.Series(dtype=str)
        frame["pctofmapunit"] = pd.Series(dtype=int) #Attempting to set the pctofmapunit column to an int does not work. It's still set as a float64. Will address this in a future story
        return frame    

    def initiallyAggregateData(frame: pd.DataFrame, aggregationRules: dict, aggregationParameters: dict) -> pd.DataFrame:
        """    
        Find out if horizon aggregation is needed and, if so, do it. For each row of data find the effective depth range to aggregate within. Group 
        rows that share the same mukey and cokey, mark all but the first item in each group for deletion later. Generate the totals for related fields 
        for each group and add them to a new column. Using these new columns, perform aggregation.Afterwords delete all rows marked for deletion. 
        """
        
        attributeTable = aggregationRules['attributetablename']
        attributeType = aggregationRules['attributelogicaldatatype']
        horizonaggregation = aggregationRules['horzaggmeth']

        if attributeTable == 'chorizon' and (attributeType == 'integer' or attributeType == 'float'):
            frame['id'] = frame.index
            depthTop = 0 if(aggregationParameters['depthtop'] is None) else int(aggregationParameters['depthtop'])
            depthBot = 0 if(aggregationParameters['depthbot'] is None) else int(aggregationParameters['depthbot'])

            #Select rows that need horizon aggregation. Modify this object, and then update frame with this data.
            horizonFrame = frame.loc[frame['actualdepthtop'].notnull() & frame['attributevalue'].notnull() & frame['hzdept_r'].notnull() & frame['hzdepb_r'].notnull()].copy()

            horizonFrame['thickness'] = pd.Series(dtype='float32')
            if aggregationParameters['layers'] == 'all layers' or depthBot == 0:
                horizonFrame['thickness'] = horizonFrame['hzdepb_r'] - horizonFrame['hzdept_r']
            else:
                horizonFrame.loc[horizonFrame['hzdepb_r'] > depthBot, 'hzdepb_r'] = depthBot
                horizonFrame.loc[horizonFrame['hzdept_r'] < depthTop, 'hzdept_r'] = depthTop
                horizonFrame['thickness'] = horizonFrame['hzdepb_r'] - horizonFrame['hzdept_r']
            horizonFrame.loc[horizonFrame['thickness'] < 0, 'thickness'] = 0


            horizonFrame['hzum'] = horizonFrame['thickness'].mul(horizonFrame['attributevalue'])
            horizonFrame[['thickness', 'attributevalue', 'tiebreakvalue', 'hzum']] = horizonFrame.groupby(['mukey', 'cokey'])[['thickness', 'attributevalue', 'tiebreakvalue', 'hzum']].transform('sum')

            #Calculate attribute and tiebreakvalue
            if horizonaggregation == 'weighted average':
                frame.loc[horizonFrame[horizonFrame['thickness'] > 0]['id'], ['attributevalue', 'tiebreakvalue']] =  horizonFrame['hzum'].div(horizonFrame['thickness'])
            else: #This is used for weighted sum. A small subset of ratings use this logic.
                frame.loc[horizonFrame[horizonFrame['thickness'] > 0]['id'], ['attributevalue', 'tiebreakvalue']] =  horizonFrame['hzum']
            frame.loc[horizonFrame[horizonFrame['thickness'] <= 0]['id'], ['attributevalue']] = pd.NA

            #Pandas can sometimes add extra decimal points that mess with aggregation logic later on. This is to prevent those scenarios from happening.
            #As of 10/30/2024, 4 is the max attributeprecision that is found in the sdm sdvattribute table. 
                #Should this value increase, so should the rounding point. This may be a future enhancement.
            frame[['attributevalue', 'tiebreakvalue']] = frame[['attributevalue', 'tiebreakvalue']].round(4)
            
            #Drop duplicated rows and unneeded columns
            frame.drop_duplicates(subset=(['mukey', 'cokey']), keep='first', inplace=True)
            frame.drop(['hzdept_r', 'hzdepb_r', 'actualdepthtop', 'actualdepthbot'], axis='columns', inplace=True)
        return frame
            
    def reduceMultiples(frame: pd.DataFrame, aggregationRules: dict, aggregationParameters: dict) -> pd.DataFrame:
        """
        This private method reduces multiple values in the data prior to aggregating.  It reduces to a single row
        per mapunit or component depending on the level of the attribute being aggregated.  It keeps the row with
        the highest/lowest non-null tiebreak value for each mapunit/component depending upon what the tiebreak
        rule is for the attribute being aggregated.  If all tiebreak values for a mapunit/component are null, it
        keeps any one row for that mapunit/component.
        """
        
        frame.reset_index(inplace=True)
        frame['id'] = frame.index
        cl = aggregationRules['complevelattribflag'] == True
        subsetKeys = ['mukey', 'cokey'] if cl else ['mukey']
        #Ideally we would not need to create these two variables and just use the pandas inplace parameter
        #However, this does not seem to be updating the frame and as a result causing issues with the data.
        if cl:
            #In cases where we need to compare against mukey and cokey, set the index to those values to allow proper comparison against tiebreakNotNull
            #and tiebreakNull. This allows us to exlude records in frame that contain null tiebreakvalues for components that contain a value matching on mukey & cokey.
            frame.set_index(keys = ['mukey', 'cokey'], inplace=True, drop=False)
            tiebreakNotNull = (frame.loc[frame['tiebreakvalue'].notna()].sort_values(by=['tiebreakvalue'], ascending=(False if aggregationParameters['tiebreakrule'] else True)) 
                .drop_duplicates(subset=subsetKeys, keep='first'))
            tiebreakNull = frame.loc[(frame['tiebreakvalue'].isna()) & (~frame.index.isin(tiebreakNotNull.index))].drop_duplicates(subset=subsetKeys, keep='first')
        else:
            #In situations where we are just comparing against mukey, we do not need to modify the index and can just make a straight comparison. 
            tiebreakNotNull = (frame.loc[frame['tiebreakvalue'].notna()].sort_values(by=['tiebreakvalue'], ascending=(False if aggregationParameters['tiebreakrule'] else True)) 
                .drop_duplicates(subset=subsetKeys, keep='first'))
            tiebreakNull = frame.loc[(frame['tiebreakvalue'].isna()) & (~frame['mukey'].isin(tiebreakNotNull['mukey']))].drop_duplicates(subset=subsetKeys, keep='first')
        frame = pd.concat([tiebreakNotNull, tiebreakNull], axis=0, join='outer')
        #Reset the index back to id to prevent issues with logic down the line.
        frame.set_index(keys= ['id'], inplace=True, drop=False)
        return frame

    def convertNullsToZeros(frame: pd.DataFrame) -> pd.DataFrame:
        """
        This private method converts null attribute and tiebreak values to zero.  This routine is called if the
        InterpretNullsAsZero flag is set.  It converts all null attribute and tiebreak values to zero.  However,
        if all attribute values for a given mapunit are null, then this conversion is not performed on those
        attribute values (or their corresponding tiebreak values) because we want to interpret "all nulls" as
        "no data".
        """
        frame['attributevaluemax'] = frame.groupby(frame['mukey'])['attributevalue'].transform('max')
        frame.loc[frame['attributevaluemax'].notna() & frame['attributevalue'].isna(), ['attributevalue', 'tiebreakvalue']] = 0
        frame.drop(['attributevaluemax'], axis='columns', inplace=True)
        return frame

    def aggregateData(frame: pd.DataFrame, aggregationRules: dict, aggregationParameters: dict) -> pd.DataFrame:
        """This method performs the final aggregation (to the mapunit level)."""
        # --------------------------------------------------------------------------------------------------------
        #  If no aggregation is to be performed (there is just one record per mapunit in this one case), then set
        #  the final rating value for each mapunit to it's corresponding attribute value.
        # --------------------------------------------------------------------------------------------------------
        frame['id'] = frame.index
        dtM = frame #Data table mapunit
        aggMethod = aggregationParameters['aggregationmethod']
        if (aggMethod == 'no aggregation necessary'):
            frame['rating'] = frame['attributevalue']
            frame['pctofmapunit'] = 100

        #--------------------------------------------------------------------------------------------------------
        # If aggregation is to be performed, start by modifying our existing dataset to separate the mapunits and
        # components into two tables.  A new table, Components, is added from a copy of the existing Results
        # table.  Any fake components (null cokey) created to add back a mapunit with no components are deleted.
        # If percent composition is significant for the aggregation method, then all components with a null percent
        # composition are also deleted.  Then the existing Results table is modified to remove all but a single
        # record per mapunit.  Aggregation is then performed.  Finally, the columns that are no longer needed in
        # the Results table are deleted.
        # --------------------------------------------------------------------------------------------------------
        else:
            dtC = frame.copy() #consider renaming "comps"
            dtM.drop_duplicates(subset=['mukey'], keep='first', inplace=True)
            dtC.dropna(subset=(['cokey'] if fetchAllComps(aggregationParameters) else ['cokey', 'comppct_r']), how='all', inplace=True)

            #---------------------------------------------------------------------------------------------------
            # Percent present for the selected condition
            # For each mapunit the final rating value is the sum of the percent compositions of all components 
            # that remain after applying the Where conditions and constraints. 
            # The percent of mapunit column contains the same number.
            #---------------------------------------------------------------------------------------------------
            if aggMethod == "percent present":
                #select all the rows (by mukey) where attributevalue is not null
                frame[frame['attributevalue'].notna()].groupby('mukey')

                #calculate the sum of the comppct_r column by mukey, then populate the rating column
                frame['rating'] = dtC.groupby(['mukey'])['comppct_r'].transform('sum')
                
                #set the rating to 0 for all records that have a null rating, then set pctofmapunit to be the same value as the rating
                frame['rating'].fillna(0, inplace=True)
                frame['pctofmapunit'] = frame['rating']
                
            #---------------------------------------------------------------------------------------------------
            # Most/Least Limiting:
            # For each mapunit, set its final rating to the attribute value for its component with the highest
            # or lowest tiebreak value.  For the Most Limiting aggregation method, use the highest tiebreak if 
            # the attribute is a limitation (ruledesign=1) and use the lowest tiebreak if the attribute is a 
            # suitability (ruledesign=2).  Do the opposite for the Least Limiting aggregation method.
            # If some components are not rated (null attribute value) the result is also "not rated" unless
            # there is a component that has the most extreme attribute value (such as a limitation value of
            # 1.0 with a Most Limiting aggregation type or 0.0 with a Least Limiting aggregation type.
            #---------------------------------------------------------------------------------------------------
            elif aggMethod == "most limiting" or aggMethod == "least limiting":
                #set the index to be the mukey, then create a new column that holds the attribute values 
                dtM.set_index('mukey', inplace=True, drop=False)
                dtC['tempAttributeValues'] = dtC['attributevalue'].fillna(dtC['tiebreakvalue'])
                if aggMethod == "most limiting":
                    sortOrder = False if aggregationRules['ruledesign'] == 1 else True
                else:
                    sortOrder = True if aggregationRules['ruledesign'] == 1 else False

                # When most limiting, we need to sort the data first by mukey, then by tiebreakvalue in Descending Order. 
                # Data Rows with a higher tiebreakvalue get pushed to the top in Descending order, and nulls are placed at the end (last)
                if (aggMethod == "most limiting"):
                    dtC.sort_values(by = ['mukey', 'tiebreakvalue'], ascending=sortOrder, inplace=True, na_position='last')
                # When Least limiting, we need to sort the data first by mukey, then by tiebreakvalue in Ascending Order. 
                # Data Rows with a lower tiebreakvalue get pushed to the top in Ascending order, and nulls are placed at the beginning (first) 
                else:
                    dtC.sort_values(by = ['mukey', 'tiebreakvalue'], ascending=sortOrder, inplace=True, na_position='first')

                #After the data is sorted based on the most or least limiting factor, grab the first occurrence of a given record.
                dtM['rating'] = dtC.groupby(['mukey']).first()['tempAttributeValues'] 

                # Set the pctofmapunit column
                dtMdtCMerge = pd.merge(dtM, dtC, left_on=dtM['mukey'], right_on=dtC['mukey'], suffixes= ('_x', r'_y'), how ='inner') #This could potentially be included in line 514
                dtM['pctofmapunit'] = dtMdtCMerge[(dtMdtCMerge['attributevalue_y'] == dtMdtCMerge['rating_x']) | (dtMdtCMerge["attributevalue_y"].isna() & dtMdtCMerge['rating_x'].isna())].groupby('mukey_x')['comppct_r_y'].sum()
            #---------------------------------------------------------------------------------------------------
            # Weighted Average:
            # For each mapunit, set its final rating value to the weighted average of all of its components'
            # attribute values.  If the components for the mapunit all have null attribute values, leave the
            # rating null.
            #---------------------------------------------------------------------------------------------------
            elif aggMethod == "weighted average":
                #NOTE: Most of the data matched for weighted average, but found some cases where the rating and pctofmapunit are incorrect. 
                #Set the totalcomppct to the sum of the comppct_r for all mukeys
                #If the entire frame is null for attribute value, do not perform any aggregation and hit the raise warning block before trying to return the frame.
                if not dtC['attributevalue'].isna().all():
                    dtC['totalcomppct'] = pd.Series(dtype='int')
                    dtC['totalcomppct'] = dtC['totalcomppct'].fillna(dtC['mukey'].map(dtC[dtC['attributevalue'].notna()].groupby('mukey')['comppct_r'].sum().astype(int))) 
                    dtC['totalcomppct'] = dtC.loc[dtC['totalcomppct'].notna(), 'totalcomppct'].astype('int')
                    
                    # Define and assign values for the doubleattribute & weightedattribute columns
                    dtC['doubleattribute'] = pd.Series(dtype=float)
                    dtC['doubleattribute'] = dtC['attributevalue']
                    dtC['weightedattribute'] = pd.Series(dtype=float)
                    dtC['weightedattribute'] = (dtC['doubleattribute'].mul(dtC['comppct_r'])).div(dtC['totalcomppct']) 
                    
                    #Set the rating to the sum of the weightedattribute for all mukeys
                    dtM['rating'] = dtC.groupby(['mukey'])['weightedattribute'].transform('sum').where(dtC['attributevalue'].notna()) 
                    #Set the pctofmapunit to the sum of the comppct_r for all mukeys
                    dtM['pctofmapunit'] = dtC['totalcomppct']
                    
                    # Drop columns at the end
                    dtC.drop(['doubleattribute', 'weightedattribute', 'totalcomppct'], axis='columns', inplace=True)

            #---------------------------------------------------------------------------------------------------
            # Minimum or Maximum:
            # For each mapunit, set its final rating to the attribute value for its component with the highest
            # or lowest tiebreak value (depending upon the tiebreak rule parameter) with non-null tiebreak
            # values taking precedence.
            #---------------------------------------------------------------------------------------------------
            elif aggMethod == "minimum or maximum":
                sortAssending = False if aggregationParameters['tiebreakrule'] else True 
                drs = dtC.where((dtC['tiebreakvalue'].notna() & dtC['mukey'].isin(dtM['mukey'])) | (dtC['tiebreakvalue'].isna() 
                                & dtC['mukey'].isin(dtM['mukey']))).sort_values(by = ['tiebreakvalue'], ascending=sortAssending)

                # Set the rating column to the first occurance of the attributevalue
                dtM['rating'] = dtM['mukey'].map(drs.groupby('mukey')['attributevalue'].first().to_dict())
                dtMdtCMerge = pd.merge(dtM, dtC, on='mukey', suffixes= ('_x', r'_y'), how ='inner') #This could potentially be included in line 514
                
                #TODO: Potentially round the value of dtMdtCMerge for attributevalue in order to grab rounded values. I.E if a component has a 8.5 rating 
                # with pctofmapunit of 40 and another component has a rating of 8.6 with pctofmapunit of 45, and we round the rating to a whole number, 
                # the pctofmapunit for the final rating should be 85%. Currently the value is being set to either 40 or 45 depending on the tiebreak 
                # rule due to rounding taking place in finishForDisplay.

                # Set the pctofmapunit column
                dtM.set_index('mukey', inplace=True, drop=False)
                dtM['pctofmapunit'] = dtMdtCMerge[(dtMdtCMerge['attributevalue_y'] == dtMdtCMerge['rating_x']) | (dtMdtCMerge["attributevalue_y"].isna() 
                                                & dtMdtCMerge['rating_x'].isna())].groupby('mukey')['comppct_r_y'].sum()
                #print(dtM)

            #---------------------------------------------------------------------------------------------------
            # Dominant Component:
            # For each mapunit, set its final rating to the attribute value for its component with the highest
            # percent composition.  If more than one component shares the high percent composition, use the
            # highest or lowest non-null tiebreak value (depending upon the tiebreak rule parameter) as a tie
            # breaker.  Note that there will always be at least one non-null tiebreak value.
            #---------------------------------------------------------------------------------------------------
            elif aggMethod == "dominant component":
                dtC['aggc'] = dtC.groupby('mukey')['comppct_r'].transform('max')
                sortAssending = False if aggregationParameters['tiebreakrule'] else True 
                drs = dtC.where((dtC['tiebreakvalue'].notna() & (dtC['comppct_r'] == dtC['aggc']) 
                                & dtC['mukey'].isin(dtM['mukey'])) | ((dtC['comppct_r'] == dtC['aggc']) 
                                & dtC['mukey'].isin(dtM['mukey']))).sort_values(by = ['tiebreakvalue'], ascending=sortAssending).groupby('mukey').first()

                if len(drs) == 0:
                    drs = dtC['mukey'].where(dtC['comppct_r'] == dtC['aggc'])

                dtM.set_index('mukey', inplace=True, drop=False)

                #If component % cutoff does not filter out all records or other niche scenarios.
                if len(drs) > 0:
                    dtM['rating'] = drs['attributevalue'] #Rating is getting set as Python 'None' rather than Null
                    dtM['pctofmapunit'] = drs['comppct_r']

            #---------------------------------------------------------------------------------------------------
            #Dominant Condition:
            #For each mapunit, set its final rating to the attribute value associated with the condition that
            #has the highest total percent composition from among all components associated with that mapunit.
            #A condition is defined using the attribute value and primary and secondary constraint values.
            #If more than one condition shares the high total percent composition, use the condition with the
            #highest or lowest tiebreak value (depending upon the tiebreak rule parameter) with non-null
            #tiebreak values taking precedence.
            #Attribute values are grouped by temporarily adding a copy of the Component DataTable (Groups) to
            #the original DataSet with a child relationship to the Component DataTable.  Rows within the parent
            #Component table are deleted until only rows with unique attribute value/primary constraint/
            #secondary constraint triplets remain for each mapunit.  Two new expression columns are then added
            #to this table to calculate the sum of the percent compositions and the highest or lowest tiebreak
            #value for each set of child records for each parent row.  Once the setup is done, the mapunits are
            #traversed and for each, the component records with the maximum total percent composition are
            #returned and sorted appropriately by their highest or lowest tiebreak values.
            #--------------------------------------------------------------------------------------------------
            elif aggMethod == "dominant condition":
                dtG = dtC.copy() #dtG stands for data table Groups
                dtM.set_index('mukey', inplace=True, drop=False) #Set index to mukey to ease setting the values in this method            
                #Get the minmax from dtG group based on user parameters
                dtC['dc_minmaxtiebreak'] = (dtG.groupby(['mukey', 'attributevalue', 'primaryconstraint', 'secondaryconstraint'], dropna=False, as_index=False)['tiebreakvalue']
                        .transform("max" if aggregationParameters['tiebreakrule'] else "min"))
                #Get the comppct_r for dtG group
                dtC['dc_totalcomppct'] = dtG.groupby(['mukey', 'attributevalue', 'primaryconstraint', 'secondaryconstraint'], dropna=False, as_index=False)['comppct_r'].transform("sum")
                #Get the max of dc_totalcomppct for dtC group
                dtC['aggc'] = dtC.groupby(['mukey'])['dc_totalcomppct'].transform("max")
                #Create an subset dataframe where aggc matches dc_totalcomppct OR aggc is null, sort order by user parameter, grabbing record containing the smallest or largest value
                filteredDtM = (dtC.where((dtC['aggc'] == dtC['dc_totalcomppct']) | dtC['aggc'].isna())
                        .sort_values(['dc_minmaxtiebreak'], ascending= False if aggregationParameters['tiebreakrule'] else True).groupby('mukey').first())
                #if dtM is in dtG: set rating equal to the first rows attribute in dtC since we have sorted values. 
                dtM['rating'] = filteredDtM.loc[(filteredDtM.index.isin(dtM['mukey'])) & (filteredDtM['aggc'] == filteredDtM['dc_totalcomppct']), ['attributevalue']]
                #Merge dtG and dtM to ease finding the necessary datapoints to place back into dtM
                mergeDT = dtG.merge(dtM[['mukey', 'rating']], how="left", left_on=dtG['mukey'], right_on=dtM['mukey'], suffixes=('_dtG', '_dtM')) 
                #Where (dtG.attributevalue matches dtM.rating OR (dtG.attributevalue is null AND dtM.rating is null)) AND mukeys match, set index to mukey to allow the 
                #setting to find the necessary row, group on mukey and get the sum of dtG.comppct_r
                dtM['pctofmapunit'] = (mergeDT.loc[((mergeDT['attributevalue'] == mergeDT['rating_dtM']) | (mergeDT['attributevalue'].isna() & mergeDT['rating_dtM'].isna())) 
                        & (mergeDT['mukey_dtG'] == mergeDT['mukey_dtM'])].set_index('mukey_dtG').groupby('mukey_dtG')[['comppct_r']].sum())

            #---------------------------------------------------------------------------------------------------
            # Throw an exception if an invalid aggregation method was specified.
            #---------------------------------------------------------------------------------------------------
            else:
                raise Exception("Invalid aggregation method specified")

        #-----------------------------------------------------------------------------------------------------
        # Remove all of the columns at the component level that are no longer needed in the Results table.
        #-----------------------------------------------------------------------------------------------------
            dtM.drop(['cokey', 'compname', 'comppct_r'], axis='columns', inplace=True)
            if (aggregationRules['attributetype'] == 'interpretation' and aggregationRules['ruledesign'] == 1 or aggregationRules['ruledesign'] == 2):
                dtM.drop(['interphr'], axis='columns', inplace=True)

        # --------------------------------------------------------------------------------------------------------
        # Finally, remove all of the columns that are no longer needed in the Results table and return.
        # --------------------------------------------------------------------------------------------------------

        frame.drop(['attributevalue', 'tiebreakvalue', 'primaryconstraint', 'secondaryconstraint'], axis='columns', inplace=True)
        #For testing
        frame.drop(['id', 'index'], axis='columns', inplace=True)

        #If the entire rating column is null, there is either no data for the particular rating or a severe problem occured.
        if frame['rating'].isna().all():
            raise Warning("Cannot find related data for this database. This is typically because no underlying rating data is available for the selected database.")
        return frame

    def finishForDisplay(frame: pd.DataFrame, aggregationRules: dict, aggregationParameters: dict, databaseLocation: str):
        """
        This private method cleans up the results that are to be returned.  First, if all mapunit ratings are
        null, it returns null since no ratings were calculated for any of the mapunits that were passed in.
        The Components table used in aggregation is removed.  If a non-class soil interpretation was aggregated,
        then a new Components and Reasons tables are added.  These two tables contain additional information for
        reporting purposes about how a mapunit rating was arrived at.
        """

        interpstable = 'cointerp'
        mapunitkey = 'mapunit.mukey'
        componentkey = 'component.cokey'
        interpsfkey = 'cokey'
        fromstatement = ' from mapunit, component, cointerp'
        where = ' where mapunit.mukey=component.mukey and component.cokey=cointerp.cokey'

        reasons = None
        #If the attribute that was aggregated is a soil interpretation, create and fill a new Components table.
        if aggregationRules['attributetype'] == 'interpretation':
        #Start by generating and running a query to retrieve all components back for the mapunits.  Select
        #the interphrc column temporarily to be used in cleaning up the records that aren't really desired
        #and the localphase column temporarily to modify the compnames on all remaining records.

            query = f"select {mapunitkey} as mukey, {componentkey} as cokey, component.compname, component.comppct_r, interphr, interphrc, component.localphase"
            query += fromstatement
            query += where
            if not disableMukeyWhereClause:
                query += f" and {mapunitkey} in (select mukey from mapunit)"

            if not fetchAllComps(aggregationParameters):
                query += ' and component.comppct_r is not null'
            if (aggregationParameters['componentpercentagecutoff'] is not None and aggregationParameters['componentpercentagecutoff'] != 0):
                query += f" and component.comppct_r >= {str(aggregationParameters['componentpercentagecutoff'])}"
            query += f" and mrulename = '{aggregationRules['nasisrulename']}' and ruledepth = 0"
            query += f" order by '{mapunitkey}', component.comppct_r desc"
            (status, conn, errorMessage) = DlUtilities.create_connection(databaseLocation)

            components = pd.read_sql_query(query, conn)
            conn.close()
        
            #Traverse the list of mapunits and delete all components that don't have the same interpretation
            #rating class as the final rating that was calculated for the associated mapunit.  Then traverse all
            #remaining components and alter their compnames using the localphase as needed.  Remove the two
            #temporary columns.

            mergedFrame = components.reset_index().merge(frame[['mukey', 'rating']], how="left", left_on=components['mukey'], right_on=frame['mukey'])
            #Drop rows where the interphrc is null or does not match rating
            components.drop(mergedFrame.loc[(mergedFrame['interphrc'].isna()) | (mergedFrame['interphrc'] != mergedFrame['rating'])].index, axis="index", inplace=True)
            #If we have a value for localphase append it to the compname
            components.loc[components['localphase'].notna(), 'compname'] += ', ' + components.loc[components['localphase'].notna(), 'localphase']
            
            #Create a list of cokeys
            cokeyList = "'"
            cokeyList += "', '".join(components['cokey'].astype(str).to_list())
            cokeyList += "'"

            #Build out reasons table. Note that this data may not match Soil Data Viewer, as the user must opt into including subrules when importing data
            if aggregationRules['ruledesign'] == 1 or aggregationRules['ruledesign'] == 2:
                query = f"select {interpsfkey} as cokey, interphrc, interphr from {interpstable} c where mrulename = '{aggregationRules['nasisrulename']}'"
                query += f' and ruledepth = 1 and {interpsfkey} in ("{cokeyList}") and exists (select * from {interpstable} where mrulename = c.mrulename and '
                query += f" {interpsfkey} = c.{interpsfkey} and ruledepth = 0 and interphr is not null) order by seqnum"
                (status, conn, errorMessage) = DlUtilities.create_connection(databaseLocation)
                reasons = pd.read_sql_query(query, conn)
                conn.close()
        isint = aggregationRules['effectivelogicaldatatype'] == 'integer'
        isWtaInterp = aggregationParameters['aggregationmethod'] == 'weighted average' and aggregationRules['attributetype'] == 'interpretation'
        #Determine where and if we need to round.
        if isint or isWtaInterp or aggregationRules['effectivelogicaldatatype'] == 'float':
            #Set how we are rounding using the python built in decimal library
            getcontext().rounding = ROUND_HALF_UP
            if isint: precision = 0
            elif isWtaInterp: precision = 3
            else: precision = int(aggregationRules['attributeprecision'])
            frame['rating'] = frame.loc[frame['rating'].notna()]['rating'].apply(lambda x: roundHalfUp(x, precision))
        frame['pctofmapunit'] = frame['pctofmapunit'].astype('Int8')
        #frame.to_json(".json", orient="records", indent=2)
        return frame, reasons

    def generateRatingTable(frame: pd.DataFrame, aggregationRules: dict, aggregationParameters: dict, databaseLocation: str, reasons: pd.DataFrame):
        """
        Rating table is created for each transaction when user tries to generate rating. Rating table starts 
        with rating_ , append attribute name, primary constraint, secondary constraint, aggregation method,
        layer name and unit of measurement if applicable and exist for selected rating generation scenario.
        Replace the rating table if already exists. 
        """
        (status, conn, errorMessage) = DlUtilities.create_connection(databaseLocation)
        if status:
            (status, isGeopackageTrue, errormessage) = dataloader.isGeopackage(databaseLocation)
        else:
            return errorMessage

        try:
            conn.execute('BEGIN TRANSACTION;')
            attrname=prconstr=secdconstr=aggrname=lyrname=deptuom=monthname=""
            cursor = conn.cursor()
            if 'attributename' in aggregationParameters:
                cursor.execute(f"SELECT resultcolumnname FROM sdvattribute WHERE lower(attributename) = '{aggregationParameters['attributename']}';")
                col_attrname = cursor.fetchall()
                attrname = col_attrname[0][0] + "_"
            cursor.execute(f"SELECT algorithminitials FROM sdvalgorithm WHERE lower(algorithmname) = '{aggregationParameters['aggregationmethod']}';")
            col_aggrname = cursor.fetchall()

            prconstr = aggregationParameters['primaryconstraint'].replace("- ","_").replace(" ","_").replace("-","_").replace(",","").replace("(","").replace(")","").replace(".","") + "_" if aggregationParameters['primaryconstraint'] else ""
            secdconstr = aggregationParameters['secondaryconstraint'].replace("- ","_").replace(" ","_").replace("-","_").replace(",","").replace("(","").replace(")","").replace(".","") + "_" if aggregationParameters['secondaryconstraint'] else ""
            aggrname = col_aggrname[0][0]
            if aggregationParameters['layers'] == "surface layer":
                lyrname = "_" + "SL"
            elif aggregationParameters['layers'] == "all layers":
                lyrname = "_" + "AL"
            elif aggregationParameters['layers'] == "depth range":
                if aggregationParameters['depthuom'] == 'cm':
                    lyrname = "_" + str(aggregationParameters['depthtop']) + "_" + str(aggregationParameters['depthbot'])
                else:
                    lyrname = "_" + str(aggregationParameters['inchtop']) + "_" + str(aggregationParameters['inchbot'])
                deptuom = "_" + aggregationParameters['depthuom']
            if aggregationParameters["monthbeg"] is not None and aggregationParameters["monthend"]:
                monthname = "_" + aggregationParameters["monthbeg"][:3] + "_" + aggregationParameters["monthend"][:3]
            ratingcolname = attrname + prconstr + secdconstr + aggrname + lyrname + deptuom + monthname

            ratingtbname = "rating_" + ratingcolname    # + "_auto"
            pctMUcolname = "pctMU_" +  ratingcolname    #"pctofmapunit"
            #ratingcolname = 'rating'
            del_columns = ['saversion','saverest','nationalmusym']
            frame.drop(columns=del_columns, inplace=True, axis=1)
            frame.rename(columns={'rating':ratingcolname}, inplace=True)
            frame.rename(columns={'pctofmapunit':pctMUcolname}, inplace=True)

            cursor.execute(f"DROP TABLE IF EXISTS {ratingtbname};")
            ratingcolnmtype = frame[ratingcolname].dtype
            if pd.api.types.is_integer_dtype(ratingcolnmtype):
                ratingcolnmtype = 'INTEGER'
            elif pd.api.types.is_float_dtype(ratingcolnmtype):
                ratingcolnmtype = 'REAL'
            elif pd.api.types.is_string_dtype(ratingcolnmtype) or pd.api.types.is_object_dtype(ratingcolnmtype):
                ratingcolnmtype = 'TEXT'
            else:
                ratingcolnmtype = 'TEXT'
            
            pctMUcolnametype = frame[pctMUcolname].dtype
            if pd.api.types.is_integer_dtype(pctMUcolnametype):
                pctMUcolnametype = 'INTEGER'
            elif pd.api.types.is_float_dtype(pctMUcolnametype):
                pctMUcolnametype = 'REAL'
            elif pd.api.types.is_string_dtype(pctMUcolnametype) or pd.api.types.is_object_dtype(pctMUcolnametype):
                pctMUcolnametype = 'TEXT'
            else:
                pctMUcolnametype = 'TEXT'

            #cursor.execute(f"CREATE INDEX IF NOT EXISTS DI_{ratingtbname} ON {ratingtbname} (mukey);")
            cursor.execute(f"CREATE TABLE [{ratingtbname}] ([areasymbol] TEXT, [areaname] TEXT, [mukey] INTEGER, [musym] TEXT, [muname] TEXT, [{ratingcolname}] {ratingcolnmtype}, [{pctMUcolname}] {pctMUcolnametype}, CONSTRAINT PK_{ratingtbname} PRIMARY KEY (mukey) )")
            frame.to_sql(ratingtbname, conn, if_exists='append', index=False)

            if isGeopackageTrue:
                cursor.execute(f"SELECT table_name FROM gpkg_contents WHERE table_name = '{ratingtbname}'")
                IsRatingTbExist = cursor.fetchone()
                if IsRatingTbExist:
                    cursor.execute(f"DELETE FROM gpkg_contents WHERE table_name = '{ratingtbname}'")
                getMbrSql = "SELECT min_x, min_y, max_x, max_y FROM gpkg_contents WHERE table_name = 'sapolygon';"
                cursor.execute(getMbrSql)
                (min_x, min_y, max_x, max_y) = cursor.fetchall()[0]
                cursor.execute(f"INSERT INTO gpkg_contents(table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES('{ratingtbname}', 'attributes', '{ratingtbname}', '', {min_x}, {min_y}, {max_x}, {max_y}, 4326 );")
            conn.commit()
            #Changing column names back to standardize response
            frame.rename(columns={ratingcolname:'rating'}, inplace=True)
            frame.rename(columns={'pctMU_'+ratingcolname:'pctofmapunit'}, inplace=True)
            return ratingtbname
        except sqlite3.Error as e:
            conn.rollback()
            raise sqlite3.Error(e)
        except Exception as e:
            conn.rollback()
            raise Exception(e)
        finally:
            conn.close()

#Supporting methods
def sanitizeStrings(dirtyStrings: dict) -> dict:
    cleanStrings = {}
    for key, value in dirtyStrings.items():
        if (type(value) == str and key not in ['nasisrulename', 'primaryconstraint', 'secondaryconstraint']):
            cleanStrings.update({key: value.lower().strip()})
        else:
            cleanStrings.update({key: value})
    return cleanStrings

def fetchAllComps(aggregationParameters: dict) -> bool:
    return (aggregationParameters["aggregationmethod"] == "minimum or maximum" or
            aggregationParameters["aggregationmethod"] == "most limiting" or
            aggregationParameters["aggregationmethod"] == "least limiting") and aggregationParameters["componentpercentagecutoff"] is None

def monthSequence(month: str) -> int:
    """Convert month string into a int value"""
    month = str(month).lower()
    switcher = {
        "january"   : 1,
        "february"  : 2,
        "march"     : 3,
        "april"     : 4,
        "may"       : 5,
        "june"      : 6,
        "july"      : 7,
        "august"    : 8,
        "september" : 9,
        "october"   : 10,
        "november"  : 11,
        "december"  : 12
    }

    if not month in switcher:
        raise KeyError("Invalid month specified")
    return switcher.get(month)

def roundHalfUp(n, decimalplace: int) -> float | int:
    """This method allows for half to round up. The rounding method is set by decimal.getcontext().rounding.
    Standard python rounding performs banker rounding I.E: 0.5 rounds to 0 instead of 1
    Real data example: 1.325 rounds to 1.32 instead of 1.33."""
    value = round(Decimal(f"{n}"), decimalplace)
    if decimalplace == 0:
        return int(value)
    else:
        return float(value)