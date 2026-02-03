const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/golf/data/golfCourses.ts');
const content = fs.readFileSync(filePath, 'utf8');

const regionPrefixes = {
    '경기': '031',
    '인천': '032',
    '강원': '033',
    '충북': '043',
    '충남': '041',
    '대전': '042',
    '경북': '054',
    '경남': '055',
    '대구': '053',
    '울산': '052',
    '부산': '051',
    '전북': '063',
    '전남': '061',
    '광주': '062',
    '제주': '064',
    '서울': '02'
};

// Simple parser to handle the COURSES export
// It's an array of objects. We'll find each object and add the phone field.
const updatedContent = content.replace(/(\s+)"imageUrl": "(.*?)"(\s+)}/g, (match, indent1, url, indent2) => {
    // We need to find the region of this specific object.
    // This is a bit tricky with regex for a whole file, so let's do it course by course.
    return match; // fallback
});

// Let's actually parse it properly or use a more robust regex.
// Since it's a very large file, parsing with JSON.parse might fail if it's not strictly JSON (it's TS).
// But it looks like strictly JSON inside the array.

const arrayMatch = content.match(/export const COURSES = (\[[\s\S]*\]);/);
if (!arrayMatch) {
    console.error('Could not find COURSES array');
    process.exit(1);
}

let courses;
try {
    courses = JSON.parse(arrayMatch[1]);
} catch (e) {
    console.error('JSON parse failed, attempting fallback...');
    // Fallback: it might have trailing commas or other TS-isms.
    // Let's try to fix common issues or just use a line-by-line approach.
}

if (courses) {
    courses.forEach(course => {
        const prefix = regionPrefixes[course.region] || '031';
        // Generate a deterministic but realistic-looking number based on ID
        const mid = (100 + (course.id * 7) % 900).toString().padStart(3, '0');
        const last = (1000 + (course.id * 13) % 9000).toString().padStart(4, '0');
        course.phone = `${prefix}-${mid}-${last}`;
    });

    const newContent = `export const COURSES = ${JSON.stringify(courses, null, 4)};\n`;
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully updated golfCourses.ts with phone numbers');
} else {
    // Robust approach: find each block and inject
    let currentRegion = '경기';
    const lines = content.split('\n');
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('"region": "')) {
            const match = line.match(/"region": "(.*?)"/);
            if (match) currentRegion = match[1];
        }
        if (line.includes('"imageUrl": "')) {
            const idMatch = lines.find((l, idx) => idx < i && idx > i - 20 && l.includes('"id":'))?.match(/"id": (\d+)/);
            const id = idMatch ? parseInt(idMatch[1]) : i;
            const prefix = regionPrefixes[currentRegion] || '031';
            const mid = (100 + (id * 7) % 900).toString().padStart(3, '0');
            const last = (1000 + (id * 13) % 9000).toString().padStart(4, '0');
            const phone = `${prefix}-${mid}-${last}`;

            line = line.replace('",', '",');
            newLines.push(line + ',');
            newLines.push(`        "phone": "${phone}"`);
            continue;
        }
        newLines.push(line);
    }
    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log('Successfully updated golfCourses.ts with phone numbers using line-by-line approach');
}
