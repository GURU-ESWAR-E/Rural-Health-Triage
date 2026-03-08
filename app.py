import sqlite3
import os
from datetime import datetime
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
from google.api_core import exceptions as google_exceptions

# Load variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS since frontend and backend might run on different ports

DB_NAME = 'triage.db'

# Initialize Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

ai_cache = {}

def generate_ai_response(category, patient_data):
    if not GEMINI_API_KEY:
        return "✨ Google Gemini API Key missing. Please set GEMINI_API_KEY environment variable to enable AI Suggestions!"
        
    try:
        model = genai.GenerativeModel(
            'gemini-2.5-flash',
            system_instruction="Provide a thorough medical analysis in 6 to 8 full sentences. Do not use bullet points or bold text within the response. The response should explain the significance of the symptoms/data, provide immediate safety precautions, and offer detailed long-term advice on local diet and lifestyle. Your tone should be calm, professional, and supportive."
        )
        if category == 'triage':
            symptoms = patient_data.get('symptoms', '')
            prompt = f"Patient has {symptoms}. Please provide a thorough medical analysis."
        elif category == 'chronic':
            bp = patient_data.get('bp', '')
            sugar = patient_data.get('sugar', '')
            risk_context = patient_data.get('risk_context', 'Normal')
            prompt = f"Patient has BP {bp} and Sugar {sugar}. Assessed risk: {risk_context}. Please provide a thorough medical analysis."
        elif category == 'maternity':
            months = patient_data.get('months', '')
            symptoms = patient_data.get('symptoms', '')
            prompt = f"Pregnant woman (month {months}) with symptoms: {symptoms}. Please provide a thorough medical analysis."
        elif category == 'snakebite':
            snake = patient_data.get('snake', 'Unknown Snake')
            symptoms = patient_data.get('symptoms', '')
            age = patient_data.get('age', 'unknown')
            gender = patient_data.get('gender', 'unknown')
            bite_time = patient_data.get('bite_time', 'unknown time')
            prompt = f"A {age} yo {gender} bitten by a {snake} at {bite_time}. Symptoms: {symptoms}. Please provide a thorough medical analysis, ensuring they know the importance of Anti-Snake Venom (ASV)."
        else:
            return "No suggestions available."
            
        if prompt in ai_cache:
            return ai_cache[prompt]
            
        response = model.generate_content(prompt)
        ai_cache[prompt] = response.text
        return response.text
    except google_exceptions.ResourceExhausted:
        return "⚠️ Gemini API Quota Limit Reached. Please wait 30 seconds before requesting another AI analysis or check your free tier usage."
    except Exception as e:
        return f"✨ AI Suggestion Error: {str(e)}"

def init_db():
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        # Table to track RED events
        c.execute('''
            CREATE TABLE IF NOT EXISTS red_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                village TEXT,
                symptoms TEXT
            )
        ''')
        # Table to track all patient history
        c.execute('''
            CREATE TABLE IF NOT EXISTS patient_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                age INTEGER,
                gender TEXT,
                symptoms TEXT,
                triage_color TEXT,
                timestamp TEXT
            )
        ''')
        # Table to track chronic records
        c.execute('''
            CREATE TABLE IF NOT EXISTS chronic_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                name TEXT,
                age INTEGER,
                gender TEXT,
                bp_sys INTEGER,
                bp_dia INTEGER,
                sugar INTEGER
            )
        ''')
        # Table to track maternity records
        c.execute('''
            CREATE TABLE IF NOT EXISTS maternity_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                name TEXT,
                age INTEGER,
                months INTEGER,
                symptoms TEXT
            )
        ''')
        # Table to store hospital feedback/complaints
        c.execute('''
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                complaint TEXT,
                village TEXT,
                rating TEXT,
                is_high_priority BOOLEAN
            )
        ''')
        conn.commit()

# Initialize Database on startup
init_db()

@app.route('/triage', methods=['POST'])
def triage():
    data = request.get_json()
    
    if not data or 'symptoms' not in data:
        return jsonify({'error': 'No symptoms provided'}), 400
        
    symptoms_input = data.get('symptoms', '')
    village = data.get('village', 'Unknown Location')
    
    # New Patient Info
    name = data.get('name', 'Unknown')
    age = data.get('age', None)
    gender = data.get('gender', 'Unknown')
    
    # Handle both string (comma-separated) and list of symptoms
    if isinstance(symptoms_input, list):
        symptoms_str = ' '.join(symptoms_input).lower()
    else:
        symptoms_str = str(symptoms_input).lower()
        
    # Keywords for severity assessment
    red_keywords = ['chest pain', 'difficulty breathing', 'unconscious']
    yellow_keywords = ['high fever', 'persistent vomiting', 'deep cut']
    
    # Default is Green (Non-Urgent)
    color = 'Green'
    home_care = 'Rest, stay hydrated, and take over-the-counter medication if needed. Monitor symptoms.'
    appointment_link = None
    
    # Check RED conditions
    if any(keyword in symptoms_str for keyword in red_keywords):
        color = 'Red'
        home_care = 'Do NOT wait. Seek emergency medical attention immediately or call an ambulance.'
        # Provide booking link for Emergency/Red
        appointment_link = 'https://rural-health.local/emergency-dispatch'
        
        # Save 'RED' triage event to SQLite DB
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            c.execute("INSERT INTO red_events (timestamp, village, symptoms) VALUES (?, ?, ?)",
                      (timestamp, village, symptoms_str))
            conn.commit()
        
    # Check YELLOW conditions
    elif any(keyword in symptoms_str for keyword in yellow_keywords):
        color = 'Yellow'
        home_care = 'Keep the patient comfortable. Visit a clinic or book an urgent appointment soon.'
        # Provide booking link for Urgent/Yellow
        appointment_link = 'https://rural-health.local/book-urgent-appointment'

    # Build response JSON
    ai_suggestion = generate_ai_response('triage', {'symptoms': symptoms_str})
    
    response = {
        'status': 'success',
        'severity_color': color,
        'home_care_instructions': home_care,
        'symptoms_analyzed': symptoms_input,
        'ai_suggestion': ai_suggestion
    }
    
    # Include booking link if Red or Yellow
    if appointment_link:
        response['book_appointment'] = appointment_link
        
    # Always save every triage event to patient_history
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute('''
            INSERT INTO patient_history (name, age, gender, symptoms, triage_color, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, age, gender, symptoms_str, color, timestamp))
        conn.commit()
        
    return jsonify(response)

@app.route('/triage/snakebite', methods=['POST'])
def snakebite_triage():
    data = request.get_json()
    name = data.get('name', 'Unknown')
    age = data.get('age', None)
    gender = data.get('gender', 'Unknown')
    village = data.get('village', 'Unknown Location')
    snake = data.get('snake', 'Unknown')
    bite_time = data.get('bite_time', 'Unknown Time')
    symptoms = data.get('symptoms', '')
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    full_symptoms = f"Snakebite ({snake}) at {bite_time}: {symptoms}"
    color = "Red"
    
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute('''
            INSERT INTO patient_history (name, age, gender, symptoms, triage_color, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, age, gender, f"Venomous Outbreak Zone - {full_symptoms}", color, timestamp))
        
        c.execute("INSERT INTO red_events (timestamp, village, symptoms) VALUES (?, ?, ?)",
                  (timestamp, village, f"Venomous Outbreak Zone - {full_symptoms}"))
        conn.commit()
        
    ai_suggestion = generate_ai_response('snakebite', {
        'snake': snake, 
        'symptoms': symptoms,
        'age': age,
        'gender': gender,
        'bite_time': bite_time
    })
    
    return jsonify({
        "status": "success",
        "severity_color": color,
        "message": f"High Priority Alert logged for {name}.",
        "ai_suggestion": ai_suggestion
    })

@app.route('/triage/chronic', methods=['POST'])
def chronic_triage():
    data = request.get_json()
    name = data.get('name', 'Unknown')
    age = data.get('age', None)
    gender = data.get('gender', 'Unknown')
    bp_sys = data.get('bp_sys')
    bp_dia = data.get('bp_dia')
    sugar = data.get('sugar')
    risk_context = data.get('risk_context', 'Normal')
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute('''
            INSERT INTO chronic_records (timestamp, name, age, gender, bp_sys, bp_dia, sugar)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (timestamp, name, age, gender, bp_sys, bp_dia, sugar))
        conn.commit()
    
    bp_str = f"{bp_sys}/{bp_dia}" if bp_sys and bp_dia else str(bp_sys or bp_dia)
    ai_suggestion = generate_ai_response('chronic', {'bp': bp_str, 'sugar': sugar, 'risk_context': risk_context})
        
    return jsonify({
        "status": "success", 
        "message": f"Health Record Updated for {name}. View suggestions below.",
        "ai_suggestion": ai_suggestion
    })

@app.route('/triage/maternity', methods=['POST'])
def maternity_triage():
    data = request.get_json()
    name = data.get('name', 'Unknown')
    age = data.get('age', None)
    months = data.get('months')
    symptoms = data.get('symptoms', '')
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute('''
            INSERT INTO maternity_records (timestamp, name, age, months, symptoms)
            VALUES (?, ?, ?, ?, ?)
        ''', (timestamp, name, age, months, symptoms))
        conn.commit()
        
    ai_suggestion = generate_ai_response('maternity', {'months': months, 'symptoms': symptoms})
    
    return jsonify({
        "status": "success", 
        "message": f"Health Record Updated for {name}. View suggestions below.",
        "ai_suggestion": ai_suggestion
    })

@app.route('/feedback', methods=['POST'])
def submit_feedback():
    data = request.get_json()
    
    rating = data.get('rating', 'Unknown')
    is_high_priority = data.get('is_high_priority', False)
    complaint = data.get('complaint', '')
    village = data.get('village', 'Unknown Location')
    
    if rating == 'Worst' and not complaint:
        return jsonify({'error': 'Please provide details for the urgent report.'}), 400
        
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute("INSERT INTO feedback (timestamp, complaint, village, rating, is_high_priority) VALUES (?, ?, ?, ?, ?)",
                  (timestamp, complaint, village, rating, is_high_priority))
        conn.commit()
        
    return jsonify({'status': 'success', 'message': 'Feedback reported to the government successfully.'})

@app.route('/history', methods=['GET'])
def get_history():
    with sqlite3.connect(DB_NAME) as conn:
        # Using dict factory to easily convert rows to JSON
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM patient_history ORDER BY timestamp DESC")
        rows = c.fetchall()
        
    history = [dict(row) for row in rows]
    return jsonify({'status': 'success', 'history': history})

@app.route('/monitor', methods=['GET'])
def get_monitor_data():
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM red_events")
        total_red = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM red_events WHERE symptoms LIKE '%Venomous Outbreak Zone%'")
        total_snakebites = c.fetchone()[0]
        
        c.execute("SELECT village, COUNT(*) as count FROM red_events GROUP BY village ORDER BY count DESC LIMIT 3")
        rows = c.fetchall()
        
    hotspots = [{"village": row[0], "count": row[1]} for row in rows]
    
    return jsonify({
        "status": "success",
        "total_red": total_red,
        "total_snakebites": total_snakebites,
        "hotspots": hotspots
    })

@app.route('/admin', methods=['GET'])
def admin_dashboard():
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        c.execute("SELECT village, COUNT(*) as count FROM red_events GROUP BY village")
        rows = c.fetchall()
        
    villages = [row[0] for row in rows]
    counts = [row[1] for row in rows]
    
    return render_template('admin.html', villages=villages, counts=counts)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
