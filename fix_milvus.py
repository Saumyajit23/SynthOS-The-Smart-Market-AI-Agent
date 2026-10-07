from pymilvus import MilvusClient

# Connect to your local Milvus
client = MilvusClient(uri="http://localhost:19530")
collection_name = "startups"

print("--- 🧹 DATA PURGE INITIALIZED ---")

# 1. Delete the broken collection
if client.has_collection(collection_name):
    client.drop_collection(collection_name)
    print(f"🗑️ Deleted mismatched collection.")

# 2. Recreate with EXACT 768 dimensions for Gemini
client.create_collection(
    collection_name=collection_name,
    dimension=768,  # This is the magic number to match Gemini
    metric_type="L2",
    auto_id=True
)

print(f"✅ Created fresh 768-dim collection: {collection_name}")
print("--- 🚀 DATABASE READY ---")