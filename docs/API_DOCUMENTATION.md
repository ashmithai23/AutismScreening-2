# TinyTots ASD Screening API Documentation

## Base URL
Default local development URL: `http://localhost:8000`

---

## Endpoints

### 1. Health & Status
- **`GET /health`**
  - **Description**: Returns the operational status of the API and ML models.
  - **Response**:
    ```json
    {
      "status": "healthy",
      "version": "2.0.0",
      "models_loaded": true
    }
    ```

### 2. Questions API
- **`GET /questions/stage1`**
  - **Description**: Retrieves the standard primary screening questions.
- **`GET /questions/stage2`**
  - **Description**: Retrieves comprehensive in-depth assessment items.
- **`POST /questions/conditional`**
  - **Description**: Retrieves dynamic follow-up questions tailored to flagged domains.

### 3. Screening & Prediction
- **`POST /screen`**
  - **Description**: Evaluates questionnaire responses using domain scoring and ML inference.
  - **Payload**:
    ```json
    {
      "child_name": "Alex",
      "age_months": 24,
      "gender": "m",
      "stage1_responses": { "A1": 1, "A2": 0, ... }
    }
    ```
  - **Response**:
    ```json
    {
      "overall_risk": "Low",
      "overall_score": 18.5,
      "domain_scores": {
        "Social Interaction": 15.0,
        "Communication": 20.0,
        "Behavioral Patterns": 10.0
      },
      "recommendations": [...]
    }
    ```

### 4. Screening History & Trends
- **`GET /history/{child_name}/{gender}`**
  - **Description**: Fetches past screening sessions and trajectory comparisons.
