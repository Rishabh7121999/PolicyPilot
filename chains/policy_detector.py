from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0
)

prompt = ChatPromptTemplate.from_template("""
You are an insurance classifier.

Determine which policy the question refers to.

Possible outputs:
health
life
both
unknown

Examples:

Question: Is ACL surgery covered?
Output: health

Question: What is my sum assured?
Output: life

Question: Compare my policies
Output: both

Question: What is my premium?
Output: unknown

Question:
{question}
""")

policy_detector = (
    prompt
    | llm
    | StrOutputParser()
)