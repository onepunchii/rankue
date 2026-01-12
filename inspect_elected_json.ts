
import fs from "fs";
import path from "path";

const filePath = path.resolve(process.cwd(), 'attached_assets', '당선인 명부_1754054558898.json');

try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    // Replace NaN with null to make it valid JSON
    fileContent = fileContent.replace(/:\s*NaN/g, ': null');

    const rawData = JSON.parse(fileContent);
    const data = Array.isArray(rawData) ? rawData : (rawData.response?.body?.items?.item || rawData.items || []);

    console.log("Total items:", Array.isArray(data) ? data.length : "Unknown structure");

    if (Array.isArray(data) && data.length > 0) {
        console.log("First item sample:", JSON.stringify(data[0], null, 2));
    } else {
        console.log("Root content keys:", Object.keys(rawData));
    }
} catch (err) {
    console.error("Error reading file:", err);
}
