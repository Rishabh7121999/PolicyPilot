from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0
)

prompt = ChatPromptTemplate.from_template("""
You are an insurance search query optimizer.

Rewrite the user's question into a detailed search query.

Expand:
- abbreviations
- medical terms
- insurance terminology

Examples:

Question:
Does my policy cover ACL surgery?

Rewritten Query:
Does the health insurance policy cover anterior cruciate ligament (ACL) reconstruction surgery, knee ligament surgery, orthopedic surgery, sports injury treatment, hospitalization expenses and surgical treatment?

Question:
What surgeries can be performed in the first year?

Rewritten Query:
Which surgeries, treatments, procedures, hospitalizations and medical conditions are covered during the first policy year, excluding conditions subject to waiting periods?

Question:
{question}

Rewritten Query:
""")

query_rewriter = (
    prompt
    | llm
    | StrOutputParser()
)