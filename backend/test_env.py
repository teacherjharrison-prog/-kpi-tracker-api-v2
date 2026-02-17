import os
from dotenv import load_dotenv
from pathlib import Path
# Load from current directory
env_path = Path('.env')
print(f'Loading from: {env_path.absolute()}')
load_dotenv(env_path)
mongo_url = os.environ.get('MONGO_URL')
print(f'MONGO_URL = {mongo_url}')
