FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home lab
COPY app.py .
USER lab
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
