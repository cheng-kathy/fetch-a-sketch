import json 
import base64
import zlib 
import requests 
from typing import Dict, List, Tuple, Any 


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
    did_list = [item['id'] for item in response['items']] 
    wid_list = [item['defaultWorkspace']['id'] for item in response['items']] 
    doc_name = [item['name'] for item in response['items']] 
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
            'elementType': 'PARTSTUDIO' # TODO: double check if considering assemblies 
        }
    )
    if response.ok: 
        response = response.json() 
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
        return response.json() 
    else: 
        print(response.text)
        raise ValueError("API call failed")
    

def get_sketch_entities(api_response: Dict[str, Any], sketch_name: str) -> Tuple[str, Dict[str, Any]]: 
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
            for entity in feature['entities']: 
                if entity['btType'] == 'BTMSketchPoint-158': # special case 
                    sketch_entities[entity['entityId']] = {
                        'btType': entity['btType'], 
                        'y': entity['y'], 
                        'x': entity['x'], 
                        'isConstruction': entity['isConstruction']
                    }
                else: 
                    sketch_entities[entity['entityId']] = entity['geometry'] # TODO: double check requirements for frontend rendering 
                    sketch_entities[entity['entityId']]['isConstruction'] = entity['isConstruction']
            return feature['featureId'], sketch_entities
    # If no matching master sketches found 
    raise ValueError("Given master sketch name not found")


def search_ref_entities(api_params: Dict[str, Any], sketch_id: str) -> List[str]: 
    """Search for any entities from the master sketch that are referenced 
    in this feature's parameters. 

    Args:
        api_params (Dict[str, Any]): the parameters of a feature. 
        sketch_id (str): featureId of the master sketch. 

    Returns:
        List[str]: a list of (possible) entityIds that are referenced in this feature. 
            The list may contain non-entityIds that would require additional checking 
            with the dictionary of known entityIds. 
    """
    ref_entities = [] 
    for param in api_params: 
        if param['btType'] == "BTMParameterQueryList-148": 
            for query in param['queries']: 
                if "query=qCompressed" in query['queryString']: 
                    if "$Query" in query['queryString']: # uncompressed query string 
                        q_string = query['queryString'][23:-6]
                    else: # compressed query string 
                        q_string = zlib.decompress(base64.b64decode(query['queryString'][28:-6])).decode("utf-8")
                    if sketch_id in q_string: 
                        for item in q_string.split("$"): 
                            if len(item.split('R')[0]) == 12: 
                                ref_entities.append(item.split('R')[0])
    return ref_entities
    

def get_dependency(did: str, wid: str, eid: str, master_sketch_name: str): 
    """Get all direct downstream dependencies to every sketch entity in the 
    master sketch in an Onshape element. 

    Args:
        did (str): document ID where the master sketch is created in. 
        wid (str): workspace ID where the master sketch is created in. 
            This must be a workspace, not a version or microversion. 
        eid (str): element ID where the master sketch is created in. 
            This must be a Part Studio, not an Assembly, etc. 
        master_sketch_name (str): name of the master sketch. If multiple sketches are renamed with 
            the same name, only the first appearing is analyzed and returned. 

    Returns:
        entities_geo (Dict[entityId: Dict[geo_info]]): geometric information for rendering individual entities; 
        entities_dep (Dict[entityId: List[dep_features]]): a list of downstream dependent features for every sketch entity; 
        doc_info (Dict[did: info]): user-defined document information for presentation (see detailed specifications below). 
    """
    # Retrieve all sketch entities in the master sketch 
    source_ps = get_ps_features(did, wid, eid) 
    master_sketch_id, entities_geo = get_sketch_entities(source_ps, master_sketch_name) # Dict[entityId: Dict[geo_info]]
    entities_dep = dict.fromkeys(entities_geo.keys(), []) # Dict[entityId: List[dependent_features]]
                                                          # Every dependent feature is in the form: Tuple[did, wid, eid, fid]
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
        if not q_searching: 
            if feature['featureId'] == master_sketch_id: 
                q_searching = True # start checking query string from now on 
        elif feature['btType'] == "BTMFeature-134" and feature['featureType'] != 'importDerived': # TODO: double check what to do with sketches 
            ref_entities = search_ref_entities(feature['parameters'], master_sketch_id)
            if ref_entities: 
                doc_info[did]['elements'][eid]['features'][feature['featureId']] = {'name': feature['name'], 'featureType': feature['featureType']}
            for entity in ref_entities: 
                if entity in entities_dep: 
                    entities_dep[entity].append((did, wid, eid, feature['featureId']))
    
    # From the same document but different elements 
    eid_list, ele_names = get_all_elements(did, wid)
    source_ind = eid_list.index(eid) 
    doc_info[did]['elements'][eid] = ele_names[source_ind]
    eid_list.pop(source_ind) # avoid double counting the source element 
    ele_names.pop(source_ind)
    for ele_ind in range(len(eid_list)): 
        doc_info[did]['elements'][eid_list[ele_ind]] = {'name': ele_names[ele_ind], 'features': {}}
        ele_def = get_ps_features(did, wid, eid_list[ele_ind])
        q_searching = False 
        for feature in ele_def['features']: 
            if not q_searching: 
                if feature['featureType'] == "importDerived": 
                    for param in feature['parameters']: 
                        if param['btType'] == "BTMParameterReferencePartStudio-3302": 
                            for query in param['partQuery']['queries']: 
                                if query['featureId'] == master_sketch_id: 
                                    q_searching = True # master sketch imported 
                            break 
            elif feature['btType'] == "BTMFeature-134" and feature['featureType'] != 'importDerived': # TODO: double check what to do with sketches 
                ref_entities = search_ref_entities(feature['parameters'], master_sketch_id)
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
                        for param in feature['parameters']: 
                            if param['btType'] == "BTMParameterReferencePartStudio-3302": 
                                for query in param['partQuery']['queries']: 
                                    if query['featureId'] == master_sketch_id: 
                                        q_searching = True # master sketch imported 
                                break 
                elif feature['btType'] == "BTMFeature-134" and feature['featureType'] != 'importDerived': # TODO: double check what to do with sketches 
                    ref_entities = search_ref_entities(feature['parameters'], master_sketch_id)
                    if ref_entities: 
                        doc_info[did_list[doc_ind]]['elements'][eid_list[ele_ind]]['features'][feature['featureId']] = {'name': feature['name'], 'featureType': feature['featureType']}
                    for entity in ref_entities: 
                        if entity in entities_dep: 
                            entities_dep[entity].append((did_list[doc_ind], wid_list[doc_ind], eid_list[ele_ind], feature['featureId']))
    
    return entities_geo, entities_dep, doc_info


if __name__ == "__main__": 
    # Master doc: https://cad.onshape.com/documents/85b058cdb321e64ab5d1f364/w/a54015e3085683ae412da7b1/e/78ac040ab4d3dfed2febd8a3
    # Folder ID: 6c38524bec94c0e6eb7f532f
    entities_geo, entities_dep, doc_info = get_dependency('85b058cdb321e64ab5d1f364', 'a54015e3085683ae412da7b1', '78ac040ab4d3dfed2febd8a3', 'Master Sketch')
    results = [entities_geo, entities_dep, doc_info]
    json.dump(results, open('test_output.json', 'w'))
    