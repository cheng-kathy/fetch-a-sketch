// calls to the python bacnekd.
const apiBase = "http://127.0.0.1:5000";
//make calls to python bacnend
export async function callPython() {
    const res = await fetch(`${apiBase}/get_dependency`,{
        method: "GET",
        headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("ok it finally works");
    return res.json();
}