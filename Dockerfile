FROM python:3.13-slim

# Install system dependencies: zbar for barcode scanning, poppler for PDF, pg for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libzbar0 \
    poppler-utils \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Run the server
CMD cd backend && python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
