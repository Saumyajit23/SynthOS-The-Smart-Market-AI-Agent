from pymilvus import MilvusClient, DataType

client = MilvusClient(uri="http://localhost:19530")
COLLECTION_NAME = "startups"

if client.has_collection(COLLECTION_NAME):
    client.drop_collection(COLLECTION_NAME)
    print(f"Dropped old collection: {COLLECTION_NAME}")

# 1. Define Schema with Dynamic Fields
schema = MilvusClient.create_schema(auto_id=True, enable_dynamic_field=True)
schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=768)

# 2. Create Collection
client.create_collection(
    collection_name=COLLECTION_NAME,
    schema=schema
)

# 3. CRITICAL NEW STEP: Create the Index
# Milvus cannot 'load' or 'search' without this.
index_params = client.prepare_index_params()
index_params.add_index(
    field_name="vector",
    index_type="IVF_FLAT",
    metric_type="COSINE",
    params={"nlist": 128}
)
client.create_index(collection_name=COLLECTION_NAME, index_params=index_params)

print(f"✅ Success! Collection '{COLLECTION_NAME}' created and INDEXED.")