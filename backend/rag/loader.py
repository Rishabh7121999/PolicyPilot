from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    AcceleratorDevice,
    AcceleratorOptions,
    PdfPipelineOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from langchain_core.documents import Document

from backend.rag.vectorstore import EMBEDDING_MODEL_NAME


def _build_converter() -> DocumentConverter:
    # Docling's layout/table models crash under MPS (float64 unsupported on
    # Apple Silicon GPUs), so force CPU inference.
    pipeline_options = PdfPipelineOptions()
    pipeline_options.accelerator_options = AcceleratorOptions(device=AcceleratorDevice.CPU)

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )


def _build_chunker() -> HybridChunker:
    tokenizer = HuggingFaceTokenizer.from_pretrained(model_name=EMBEDDING_MODEL_NAME)
    return HybridChunker(tokenizer=tokenizer)


def parse_and_chunk(
    pdf_path: str,
    policy_type: str | None = None,
    policy_id: str | int | None = None,
) -> tuple[list[Document], str]:
    """Parse a PDF with Docling and chunk it along document structure.

    Returns (chunks, full_text): chunks are LangChain Documents ready for the
    vector store; full_text is the whole document as markdown (tables intact),
    for the structured-extraction chain.
    """
    converter = _build_converter()
    chunker = _build_chunker()

    result = converter.convert(pdf_path)
    dl_doc = result.document

    source_file = Path(pdf_path).name
    chunks: list[Document] = []

    for chunk_index, chunk in enumerate(chunker.chunk(dl_doc=dl_doc)):
        pages = sorted(
            {prov.page_no for item in chunk.meta.doc_items for prov in item.prov}
        )

        metadata: dict[str, str | int] = {
            "source_file": source_file,
            "chunk_index": chunk_index,
        }

        if policy_type is not None:
            metadata["policy_type"] = policy_type

        if pages:
            metadata["page"] = pages[0]

        if chunk.meta.headings:
            metadata["section"] = " > ".join(chunk.meta.headings)

        if policy_id is not None:
            metadata["policy_id"] = str(policy_id)

        chunks.append(
            Document(
                page_content=chunker.contextualize(chunk=chunk),
                metadata=metadata,
            )
        )

    full_text = dl_doc.export_to_markdown()

    return chunks, full_text
