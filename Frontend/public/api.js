const ApiClient = (() => {
	const REQUEST_TIMEOUT_MS = 12000;

	function getToken() {
		return localStorage.getItem("token");
	}

	function getRole() {
		return localStorage.getItem("role");
	}

	function clearSession() {
		localStorage.removeItem("token");
		localStorage.removeItem("role");
	}

	async function request(url, options = {}) {
		const headers = {
			...(options.headers || {}),
		};

		if (!headers["Content-Type"] && options.body && !(options.body instanceof FormData)) {
			headers["Content-Type"] = "application/json";
		}

		const token = getToken();
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		let response;
		try {
			response = await fetch(url, {
				...options,
				headers,
				cache: "no-store",
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeoutId);
		}

		const contentType = response.headers.get("content-type") || "";
		const isJson = contentType.includes("application/json");
		const payload = isJson ? await response.json() : null;

		if (response.status === 401) {
			clearSession();
			throw new Error("UNAUTHORIZED");
		}

		if (!response.ok) {
			const message = payload?.detail || payload?.message || `HTTP ${response.status}`;
			throw new Error(message);
		}

		return payload;
	}

	return {
		getToken,
		getRole,
		clearSession,
		request,
	};
})();
