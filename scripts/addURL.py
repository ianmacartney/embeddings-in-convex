""" Import files into Convex using Langchain document loaders

Setup:
!pip install "playwright"
!pip install "unstructured"
!pip install "convex"
!pip install "python-dotenv"
!pip install tiktoken

!playwright install
"""

from langchain.document_loaders import PlaywrightURLLoader
from langchain.text_splitter import CharacterTextSplitter


urls = [
    "https://stack.convex.dev/articles",
]
loader = PlaywrightURLLoader(urls=urls, remove_selectors=["header", "footer"])
data = loader.load()
text_splitter = CharacterTextSplitter.from_tiktoken_encoder(
    chunk_size=100, chunk_overlap=0
)
texts = text_splitter.split_text(data.page_content)
# texts = text_splitter.create_documents([data.page_content])
print(texts[0])
print(texts[1])

import os
from dotenv import load_dotenv

from convex import ConvexClient

load_dotenv(".env.local")
load_dotenv()

backend = os.getenv("CONVEX_URL")
if not backend:
    raise KeyError("Missing CONVEX_URL")

client = ConvexClient(backend)
print(
    client.action(
        "sources:add",
        dict(
            name=data.metadata["source"],
            chunks=map(
                lambda chunk: dict(
                    text=chunk.page_content,
                    lines={"from": 1, "to": 2},
                ),
                texts,
            ),
        ),
    )
)
