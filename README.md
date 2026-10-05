# TinyTots Autism Screening Decision Support System (v2)

An intelligent, multi-stage Autism Spectrum Disorder (ASD) clinical decision-support and screening platform designed for toddlers. The system integrates machine learning models, domain-based behavioral analysis, age-aware scoring, and interactive progress tracking.

---

## 🌟 Key Features

- **Multi-Stage Screening Workflow**:
  - **Stage 1 (Primary Screening)**: Initial risk stratification using standard clinical indicators.
  - **Stage 2 (In-Depth Assessment)**: Detailed domain-specific queries triggered for borderline or flagged responses.
- **Hybrid Machine Learning Architecture**:
  - Random Forest & Logistic Regression classifiers trained on balanced clinical toddler screening datasets.
  - Clinical explainability and feature contribution breakdowns.
- **Domain-Based Behavioral Scoring**:
  - Evaluation broken down across **Social Interaction**, **Communication**, and **Behavioral Patterns**.
- **Historical Trend & Comparison**:
  - Automated screening history persistence with cross-session trend evaluation (improving, stable, declining).
- **Comprehensive Clinical Reports**:
  - Dynamic radar/domain visualizations, actionable pediatric recommendations, and printable/downloadable summary reports.
- **Modern Responsive UI**:
  - Built with React 18, Vite, TypeScript, Tailwind CSS, and Radix UI components.

---

## 🏗️ Project Architecture

```
tiny-tots-assess/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # REST API endpoints & CORS setup
│   ├── predictor.py          # ML model inference (Hybrid RF + LR)
│   ├── scorer.py             # Domain-based scoring & age-aware thresholds
│   ├── recommendations.py    # Actionable guidance generator
│   ├── storage.py            # Local file-based history & trend tracking
│   ├── report.py             # Clinical report compiler
│   ├── questions.py          # Stage 1, Stage 2, and conditional questions
│   ├── asd_model.pkl         # Trained Random Forest model
│   ├── asd_lr_model.pkl      # Trained Logistic Regression model
│   └── requirements.txt      # Python dependencies
├── tiny-tots-assess-main/    # React + Vite frontend application
│   ├── src/
│   │   ├── components/       # UI & screening components
│   │   ├── pages/            # Application pages & routes
│   │   └── lib/              # Utility helpers & API client
│   ├── package.json          # Node dependencies & scripts
│   └── vite.config.ts        # Vite configuration
└── screening_history/        # JSON storage for screening records
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** & npm / bun

---

### 2. Backend Setup

```bash
# Navigate to the workspace root
# Create and activate a virtual environment (optional but recommended)
python -m venv venv
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Start the FastAPI server
python -m uvicorn backend.main:app --reload --port 8000
```

The API documentation will be accessible at `http://127.0.0.1:8000/docs`.

---

### 3. Frontend Setup

```bash
# Navigate to the frontend directory
cd tiny-tots-assess-main

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be running at `http://localhost:8080` (or `http://localhost:5173`).

---

## 🧪 Technologies Used

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons, React Query
- **Backend**: FastAPI, Uvicorn, Pydantic, Scikit-Learn, Pandas, NumPy, Joblib
- **Machine Learning**: Random Forest, Logistic Regression, SMOTE dataset balancing
