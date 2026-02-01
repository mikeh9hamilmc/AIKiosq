
const key = process.argv[2];
if (!key) {
    console.error("Please provide an API key");
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
console.log(`Testing key: ${key.slice(0, 5)}...`);

try {
    const resp = await fetch(url);
    console.log(`Status: ${resp.status}`);
    const data = await resp.json();

    if (resp.ok) {
        console.log("Success! API Key is valid.");
        console.log("Available models:");
        data.models?.forEach(m => console.log(m.name));
    } else {
        console.error("Error response:", JSON.stringify(data, null, 2));
    }
} catch (e) {
    console.error("Request failed:", e);
}
