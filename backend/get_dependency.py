import json 
import base64
import zlib 
import requests 
from typing import Dict, List, Tuple, Any 

import re
import math

def _parse_qty(param):
    """Return numeric value from a BTMParameterQuantity-147 param (in or deg)."""
    if param.get("value") is not None:
        return float(param["value"])
    expr = (param.get("expression") or "").lower()
    expr = expr.replace("in", "").replace("deg", "")
    expr = re.sub(r"[^0-9+.\-*/() ]", "", expr)
    try:
        return float(eval(expr))
    except Exception:
        return 0.0

def _parse_enum(param):
    return param.get("value") or ""

def _extract_mate_connectors(api_response):
    """Returns {featureId: [{name, translation:[x,y,z], rotationType, rotationDeg, originQuery}]}."""
    out = {}
    for feat in api_response.get("features", []):
        f_id = feat.get("featureId")
        subfs = feat.get("subFeatures") or []
        connectors = []
        for sub in subfs:
            if (sub.get("featureType") or "").lower() != "mateconnector" and sub.get("name") != "Mate connector":
                continue
            params = sub.get("parameters", [])
            t = {"translationX": 0.0, "translationY": 0.0, "translationZ": 0.0,
                 "rotationType": "", "rotationDeg": 0.0, "originQuery": None, "name": sub.get("name")}
            for p in params:
                pid = p.get("parameterId") or ""
                if pid == "translationX":
                    t["translationX"] = _parse_qty(p)
                elif pid == "translationY":
                    t["translationY"] = _parse_qty(p)
                elif pid == "translationZ":
                    t["translationZ"] = _parse_qty(p)
                elif pid == "rotationType":
                    t["rotationType"] = _parse_enum(p)
                elif pid == "rotation":
                    t["rotationDeg"] = _parse_qty(p)
                elif pid in ("originQuery", "originQuery1", "query") and p.get("queries"):
                    t["originQuery"] = p["queries"][0].get("queryString")
            connectors.append(t)
        if connectors:
            out[f_id] = connectors
    return out


with open("APIKey.json") as f: 
    data = json.load(f)
    API_ACCESS = data['access']
    API_SECRET = data['secret']

BASE_URL = "cad.onshape.com" # TODO: update if accessing files in enterprise accounts 


def get_folder(did: str) -> str: 
    """Get the parent ID of the folder that the document belongs to. 

    Args:
        did (str): document ID. 

    Returns:
        str: parent ID of the folder 
    """
    # https://cad.onshape.com/glassworks/explorer/#/Document/getDocument
    response = requests.get(
        "https://{}/api/documents/{}".format(BASE_URL, did), 
        auth=(API_ACCESS, API_SECRET), 
        headers={
            "Accept": "application/json;charset=UTF-8; qs=0.09", 
            "Content-Type": "application/json"
        }
    )
    if response.ok: 
        return response.json()['parentId']
    else: 
        print(response.text)
        raise ValueError("API call failed")
    

def get_docs_in_folder(folder_id: str) -> Tuple[List[str], List[str], List[str]]: 
    """Get all documents within a folder. 

    Args:
        folder_id (str): parent ID of the folder. 

    Returns:
        Tuple[List[str], List[str], List[str]]: a list of document IDs in the folder, 
            a list of corresponding workspace IDs for the main branch, and 
            a list of corresponding document names. 
    """
    # Undocumented API endpoint -- expect unknown behaviours 
    response = requests.get(
        "https://{}/api/globaltreenodes/folder/{}".format(BASE_URL, folder_id), 
        auth=(API_ACCESS, API_SECRET), 
        headers={
            "Accept": "application/json;charset=UTF-8; qs=0.09", 
            "Content-Type": "application/json"
        }
    )
    if not response.ok: 
        print(response.text)
        raise ValueError("API call failed")
    
    response = response.json() 
    did_list, wid_list, doc_name = [], [], [] 
    for item in response['items']: 
        if item['resourceType'] == 'document': # does not consider other file types or sub-folders 
            did_list.append(item['id'])
            wid_list.append(item['defaultWorkspace']['id'])
            doc_name.append(item['name'])
    return did_list, wid_list, doc_name 


def get_all_elements(did: str, wid: str) -> Tuple[List[str], List[str]]: 
    """Get all elements in a document. 

    Args:
        did (str): document ID. 
        wid (str): workspace (branch) ID. 

    Returns:
        Tuple[List[str], List[str]]: a list of element IDs (eid) and 
            a list of corresponding element names. 
    """
    # https://cad.onshape.com/glassworks/explorer/#/Document/getElementsInDocument 
    response = requests.get(
        "https://{}/api/documents/d/{}/w/{}/elements".format(BASE_URL, did, wid), 
        auth=(API_ACCESS, API_SECRET), 
        headers={
            "Accept": "application/json;charset=UTF-8; qs=0.09", 
            "Content-Type": "application/json"
        }, 
        params={
            'elementType': 'PARTSTUDIO' 
        }
    )
    if response.ok: 
        response = response.json() 
        json.dump(response, open('test_elements.json', 'w'))

        eid_list = [ele['id'] for ele in response]
        eid_names = [ele['name'] for ele in response]
        return eid_list, eid_names
    else: 
        print(response.text)
        raise ValueError("API call failed")


def get_ps_features(did: str, wid: str, eid: str) -> Any: 
    # https://cad.onshape.com/glassworks/explorer/#/PartStudio/getPartStudioFeatures
    response = requests.get(
        "https://{}/api/v12/partstudios/d/{}/w/{}/e/{}/features".format(
            BASE_URL, did, wid, eid
        ), # using v12 for simpler API response structure 
        auth=(API_ACCESS, API_SECRET), 
        headers={
            "Accept": "application/json;charset=UTF-8; qs=0.09", 
            "Content-Type": "application/json"
        }
    )
    if response.ok: 
        json.dump(response.json(), open('test_features.json', 'w'))
        return response.json() 
    else: 
        print(response.text)
        print(response.headers)
        raise ValueError("API call failed")
    

def _get_sketch_entities(api_response: Dict[str, Any], sketch_name: str) -> Tuple[str, Dict[str, Any]]: 
    """Retrieve all sketch entities in the master sketch, with useful geometric information. 

    Args:
        api_response (Dict[str, Any]): API response from the element that the master sketch lives in. 
        sketch_name (str): name of the master sketch. If multiple sketches are renamed with 
            the same name, only the first appearing is analyzed and returned. 

    Returns:
        Tuple[str, Dict[str, Any]]: Tuple[master_sketch_featureId, Dict[entityId: Dict[geo_info]]]. 
            The geo_info dict follows the same format as returned by the API call. 
    """
    sketch_entities = {} # Dict[entityId: Dict[geo_info]]
    for feature in api_response['features']: 
        if feature['name'] == sketch_name: 
            plane_side = "none"
            query_strings = []
            for p in feature.get("parameters", []):
                if p.get("btType") == "BTMParameterQueryList-148":
                    for q in p.get("queries", []):
                        qs = q.get("queryString")
                        if qs:
                            query_strings.append(qs)

            for qs in query_strings:
                qs_lower = qs.lower()
                if "top" in qs_lower and "plane" in qs_lower:
                    plane_side = "top"
                    break
                if "front" in qs_lower and "plane" in qs_lower:
                    plane_side = "front"
                    break
                if "right" in qs_lower and "plane" in qs_lower:
                    plane_side = "right"
                    break

            for entity in feature['entities']: 
                if entity['btType'] == 'BTMSketchPoint-158': # special case 
                    sketch_entities[entity['entityId']] = {
                        'btType': entity['btType'], 
                        'y': entity['y'], 
                        'x': entity['x'], 
                        'isConstruction': entity['isConstruction'],
                        'plane_side': plane_side,
                        'featureId': feature.get('featureId')
                    }
                else: 
                    sketch_entities[entity['entityId']] = entity['geometry'] 
                    sketch_entities[entity['entityId']]['isConstruction'] = entity['isConstruction']
                    sketch_entities[entity['entityId']]["plane_side"] = plane_side
                    sketch_entities[entity['entityId']]["featureId"] = feature.get('featureId')

                    # carry over trim parameters so JS can render finite segments
                    if 'startParam' in entity:
                        sketch_entities[entity['entityId']]['startParam'] = entity['startParam']
                    if 'endParam' in entity:
                        sketch_entities[entity['entityId']]['endParam'] = entity['endParam']
                    
            return feature['featureId'], sketch_entities
    # If no matching master sketches found 
    raise ValueError("Given master sketch name \"{}\" not found".format(sketch_name))


def _search_ref_entities(api_params: List[Any], sketch_ids: List[str]) -> List[str]: 
    """Search for any entities from the master sketch that are referenced 
    in this feature's parameters. 

    Args:
        api_params (List[Any]): a list of feature parameters returned by the Onshape API. 
        sketch_ids (List[str]): a list of featureIds of master sketches. 

    Returns:
        List[str]: a list of (possible) entityIds that are referenced in this feature. 
            The list may contain non-entityIds that would require additional checking 
            with the dictionary of known entityIds. 
    """
    ref_entities = [] 
    for param in api_params: 
        if param['btType'] == "BTMParameterArray-2025":
            sub_params = [item['parameters'] for item in param['items']]
            ref_entities.extend(_search_ref_entities([item for sublist in sub_params for item in sublist], sketch_ids))
        elif param['btType'] == "BTMParameterQueryList-148": 
            for query in param['queries']: 
                if "query=qCompressed" in query['queryString']: 
                    if "$Query" in query['queryString']: # uncompressed query string 
                        q_string = query['queryString'][23:-6]
                    else: # compressed query string 
                        q_string = zlib.decompress(base64.b64decode(query['queryString'][28:-6])).decode("utf-8")
                    for sketch_id in sketch_ids:
                        if sketch_id in q_string: 
                            for item in q_string.split("$"): 
                                ref_entities.append(item[:12]) # possible entityId
                            break 
    ref_entities = list(set(ref_entities)) # remove duplicates
    return ref_entities


def _is_derived_master_sketch(api_params: List[Any], did: str, eid: str, fids: List[str]) -> bool: 
    """Check if the derive feature is importing one or more master sketches. 

    Args:
        api_params (List[Any]): a list of feature parameters returned by the Onshape API. 
        did (str): document ID of the source master sketch. 
        eid (str): element ID of the source master sketch. 
        fids (List[str]): a list of feature IDs of the source master sketches.

    Returns:
        bool: if the derive feature is importing one or more master sketches.
    """
    for param in api_params: 
        if param['btType'] == "BTMParameterReferencePartStudio-3302": 
            namespace = param['namespace'].split("::")
            for item in namespace: 
                if item[0] == "e": 
                    source_eid = item[1:]
            if eid != source_eid: 
                return False
            for query in param['partQuery']['queries']: 
                if query['btType'] == "BTMIndividualCreatedByQuery-137" and query['featureId'] in fids: 
                    return True # individual master sketch imported
                elif query['btType'] == "BTMIndividualQuery-138":
                    return True # entire part studio imported
                else: 
                    pass # check next query if the derived feature is importing multiple sketches 
        elif param['btType'] == "BTMParameterQueryList-148": 
            for query in param['queries']: 
                if query['btType'] == "BTMIndividualCreatedByQuery-137": 
                    if query['featureId'] in fids: 
                        return True
    return False 
    

def get_dependency(did: str, wid: str, eid: str, master_sketches: List[str]): 
    """Get all direct downstream dependencies to every sketch entity in the 
    master sketch in an Onshape element. 

    Args:
        did (str): document ID where the master sketch is created in. 
        wid (str): workspace ID where the master sketch is created in. 
            This must be a workspace, not a version or microversion. 
        eid (str): element ID where the master sketch is created in. 
            This must be a Part Studio, not an Assembly, etc. 
        master_sketches (List[str]): a list of names of all master sketchs. If multiple sketches are renamed with 
            the same name, only the first appearing is analyzed and returned. 

    Returns:
        entities_geo (List[Dict[entityId: Dict[geo_info]]]): a list of geometric information for rendering individual entities; 
        entities_dep (Dict[entityId: List[dep_features]]): a list of downstream dependent features for every sketch entity; 
        doc_info (Dict[did: info]): user-defined document information for presentation (see detailed specifications below). 
    """
    entities_geo = [] # List[Dict[entityId: Dict[geo_info]]]
    entities_dep = {} # Dict[entityId: List[dependent_features]]
                      # Every dependent feature is in the form: [did, wid, eid, fid]
    
    # Retrieve all sketch entities in the master sketch 
    source_ps = get_ps_features(did, wid, eid)
    mate_connectors = _extract_mate_connectors(source_ps)
 
    master_sketch_ids = [] 
    for master_sketch in master_sketches:
        master_sketch_id, geo_dict = _get_sketch_entities(source_ps, master_sketch) 
        master_sketch_ids.append(master_sketch_id)
        entities_geo.append(geo_dict)
        entities_dep.update({key: [] for key in geo_dict.keys()})
        
    doc_info = {did: {
        'wid': wid, 
        'name': None, 
        'elements': {eid: {
            'name': None, 
            'features': {} # Dict[fid: name]
        }} 
    }} 
    
    # Search for features that reference entities in the master sketch 
    q_searching = False # check query string only after importing/creating the master sketch 
    
    # From the same element 
    for feature in source_ps['features']: 
        if feature['featureId'] in master_sketch_ids: 
            q_searching = True # start checking query string from now on 
            doc_info[did]['elements'][eid]['features'][feature['featureId']] = {'name': feature['name'], 'featureType': feature['featureType']}
        elif q_searching and feature['btType'] == "BTMFeature-134" and feature['featureType'] != 'importDerived': # ignore sketches
            ref_entities = _search_ref_entities(feature['parameters'], master_sketch_ids)
            if ref_entities: 
                doc_info[did]['elements'][eid]['features'][feature['featureId']] = {'name': feature['name'], 'featureType': feature['featureType']}
            for entity in ref_entities: 
                if entity in entities_dep: 
                    entities_dep[entity].append((did, wid, eid, feature['featureId']))
    
    # From the same document but different elements 
    eid_list, ele_names = get_all_elements(did, wid)
    source_ind = eid_list.index(eid) 
    doc_info[did]['elements'][eid]['name'] = ele_names[source_ind]
    eid_list.pop(source_ind) # avoid double counting the source element 
    ele_names.pop(source_ind)
    for ele_ind in range(len(eid_list)): 
        doc_info[did]['elements'][eid_list[ele_ind]] = {'name': ele_names[ele_ind], 'features': {}}
        ele_def = get_ps_features(did, wid, eid_list[ele_ind])
        q_searching = False 
        for feature in ele_def['features']: 
            if not q_searching: 
                if feature['featureType'] == "importDerived": 
                    q_searching = _is_derived_master_sketch(feature['parameters'], did, eid, master_sketch_ids)
            elif feature['btType'] == "BTMFeature-134" and feature['featureType'] != 'importDerived': # ignore sketches
                ref_entities = _search_ref_entities(feature['parameters'], master_sketch_ids)
                if ref_entities: 
                    doc_info[did]['elements'][eid_list[ele_ind]]['features'][feature['featureId']] = {'name': feature['name'], 'featureType': feature['featureType']}
                for entity in ref_entities: 
                    if entity in entities_dep: 
                        entities_dep[entity].append((did, wid, eid_list[ele_ind], feature['featureId']))
    
    # From every other document in the same folder 
    folder_id = get_folder(did)
    did_list, wid_list, doc_name = get_docs_in_folder(folder_id)
    source_ind = did_list.index(did) 
    doc_info[did]['name'] = doc_name[source_ind]
    did_list.pop(source_ind) # avoid double counting the source document 
    wid_list.pop(source_ind)
    doc_name.pop(source_ind)
    for doc_ind in range(len(did_list)): 
        doc_info[did_list[doc_ind]] = {
            'wid': wid_list[doc_ind], 
            'name': doc_name[doc_ind], 
            'elements': {} 
        }
        eid_list, ele_names = get_all_elements(did_list[doc_ind], wid_list[doc_ind])
        for ele_ind in range(len(eid_list)): # from every element in the document 
            doc_info[did_list[doc_ind]]['elements'][eid_list[ele_ind]] = {'name': ele_names[ele_ind], 'features': {}}
            ele_def = get_ps_features(did_list[doc_ind], wid_list[doc_ind], eid_list[ele_ind])
            q_searching = False 
            for feature in ele_def['features']: 
                if not q_searching: 
                    if feature['featureType'] == "importDerived": 
                        q_searching = _is_derived_master_sketch(feature['parameters'], did, eid, master_sketch_ids)
                elif feature['btType'] == "BTMFeature-134" and feature['featureType'] != 'importDerived': # ignore sketches 
                    ref_entities = _search_ref_entities(feature['parameters'], master_sketch_ids)
                    if ref_entities: 
                        doc_info[did_list[doc_ind]]['elements'][eid_list[ele_ind]]['features'][feature['featureId']] = {'name': feature['name'], 'featureType': feature['featureType']}
                    for entity in ref_entities: 
                        if entity in entities_dep: 
                            entities_dep[entity].append((did_list[doc_ind], wid_list[doc_ind], eid_list[ele_ind], feature['featureId']))
    
    return entities_geo, entities_dep, doc_info, mate_connectors


if __name__ == "__main__": 
    # Master doc: https://cad.onshape.com/documents/85b058cdb321e64ab5d1f364/w/a54015e3085683ae412da7b1/e/78ac040ab4d3dfed2febd8a3
    # Folder ID: 6c38524bec94c0e6eb7f532f
    # entities_geo, entities_dep, doc_info = get_dependency('85b058cdb321e64ab5d1f364', 'a54015e3085683ae412da7b1', '78ac040ab4d3dfed2febd8a3', ['Master Sketch'])
    # results = [entities_geo, entities_dep, doc_info]
    # json.dump(results, open('test_output_spray.json', 'w'))
    
    # Master doc: https://cad.onshape.com/documents/56e646580a50f305280bbafc/w/5a99299fc7972f9cefe014a6/e/482f1ae4627799170e6a9a4e
    # Folder ID: 514f41dd2f31f68c801bfeaa
    entities_geo, entities_dep, doc_info,  mate_connectors= get_dependency(
        '56e646580a50f305280bbafc', '5a99299fc7972f9cefe014a6', '482f1ae4627799170e6a9a4e', 
        ['Drivebase Top', 'Drivebase Side', 'Reef', 'Substation', 'Arm', 'Hopper', 'Frame Side', 'Claw Sketch', 'Front Home Coral', 'Coral Grabber', 'Chain Plan', 'Tube Sketch']
    )
    results = [entities_geo, entities_dep, doc_info, mate_connectors]
    json.dump(results, open('test_output_robot.json', 'w'))
