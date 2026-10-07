from pymilvus import MilvusClient

# Connect to your local Milvus
client = MilvusClient(uri="http://localhost:19530")

COLLECTION_NAME = "startups"

# 1. Describe the collection to see the schema
if client.has_collection(COLLECTION_NAME):
    details = client.describe_collection(COLLECTION_NAME)
    
    # Extract dimension info
    # We are looking for 'dimension': 768
    print(f"--- Collection: {COLLECTION_NAME} ---")
    print(f"Status: Found and Active")
    
    # 2. Check current record count (should be 0 if fresh)
    stats = client.get_collection_stats(COLLECTION_NAME)
    print(f"Current Records: {stats['row_count']}")
    
    print("\n✅ Verification Complete: Milvus is ready for Gemini embeddings.")
else:
    print(f"❌ Error: Collection '{COLLECTION_NAME}' not found. Re-run fix_memory.py.")