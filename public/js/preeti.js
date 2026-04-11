// Global toggle state
window.isNepaliMode = false;

// Standard Preeti to Unicode Mapping
const preeti_map = {
  "~":"ञ्", "`":"़", "!":"ज्ञ", "@":"द्द", "#":"घ", "$":"द्ध", "%":"छ", "^":"ट", "&":"ठ", "*":"ड", "(":"ढ", ")":"ण", "_":")", "-":"(", "+":"़", "=":".",
  "Q":"त्त", "W":"ड्ढ", "E":"ऐ", "R":"द्व", "T":"झ", "Y":"ठ", "U":"ङ", "I":"क्ष", "O":"इ", "P":"ए", "{":"र्", "}":"घ", "|":"्र", "\\":"्",
  "q":"त्र", "w":"ध", "e":"भ", "r":"च", "t":"त", "y":"थ", "u":"ग", "i":"ष", "o":"य", "p":"उ", "[":"ृ", "]":"े",
  "A":"ा", "S":"क्", "D":"म्", "F":"ा्", "G":"न्", "H":"ज्", "J":"व्", "K":"प्", "L":"ी", ":":"स्", "\"":"ू",
  "a":"ब", "s":"क", "d":"म", "f":"ा", "g":"न", "h":"ज", "j":"व", "k":"प", "l":"ि", ";":"स", "'":"ु",
  "Z":"श्", "X":"ह्", "C":"ऋ", "V":"ख्", "B":"द्य", "N":"ल्", "M":"ः", "<":"?", ">":"?", "?":"रु",
  "z":"श", "x":"ह", "c":"अ", "v":"ख", "b":"द", "n":"ल", "m":"इ", ",":",", ".":"।", "/":"र",
  "0":"०", "1":"१", "2":"२", "3":"३", "4":"४", "5":"५", "6":"६", "7":"७", "8":"८", "9":"९"
};

// Event Delegation for dynamic inputs
document.addEventListener('keypress', function(e) {
    // Check if Nepali mode is ON
    if (!window.isNepaliMode) return;
    
    // Only apply to text inputs and textareas
    if (!e.target.matches('input[type="text"], textarea')) return;
    
    // Do not interfere with special keys
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    
    const charCode = e.which || e.keyCode;
    const charStr = String.fromCharCode(charCode);
    
    // Check if character is in map
    if (preeti_map.hasOwnProperty(charStr)) {
        e.preventDefault();
        const unicode = preeti_map[charStr];
        
        const input = e.target;
        
        // Insert unicode character at cursor position
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const val = input.value;
        
        // Handle selection replacement
        input.value = val.substring(0, start) + unicode + val.substring(end);
        
        // Restore cursor position after inserted character
        input.selectionStart = input.selectionEnd = start + unicode.length;
        
        // Trigger input event for auto-resizing textareas or other listeners
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
});
