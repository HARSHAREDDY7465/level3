const fileKey = (file) => [file.name, file.size, file.lastModified].join("|");

const answerData = answersStore.get(questionId);

// ===== SharePoint Documents =====
if (answerData?.documentUrl) {

    const urls = answerData.documentUrl
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

    const fileNames = (answerData.answerValue || "")
        .split(",")
        .map(x => x.trim());

    textEl.textContent = `${urls.length} file(s)`;

    tableWrapper.classList.remove("d-none");

    tbody.innerHTML = urls.map((url, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>
                <a href="${url}"
                   target="_blank"
                   rel="noopener noreferrer">
                    ${fileNames[index] || "File"}
                </a>
            </td>
        </tr>
    `).join("");

    return;
}
// ===== End SharePoint =====

const getExistingFiles = () => {
    return Array.isArray(answerData?.filesData)
        ? answerData.filesData
        : [];
};
