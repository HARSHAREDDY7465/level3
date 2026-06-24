{% assign contactId = user.id %}
{% assign currentPage = request.params['page'] | default: 1 | integer %}
{% assign pageSize = 5 %}
{% assign searchText = request.params['search'] | default: '' %}
{% assign prevPage = currentPage | minus: 1 | string %}
{% assign nextPage = currentPage | plus: 1 | string %}

{% fetchxml applications %}
<fetch version="1.0" mapping="logical" page="{{ currentPage }}" count="{{ pageSize }}">
    <entity name="lpi_application">
        <attribute name="lpi_applicationid" />
        <attribute name="lpi_contact" />
        <attribute name="lpi_functionalflow" />
        <attribute name="lpi_name" />
        <attribute name="statecode" />
        <attribute name="statuscode" />
        <attribute name="lpi_submissiondate" />

        <order attribute="lpi_name" descending="false" />

        <filter type="and">
            <condition attribute="lpi_contact" operator="eq" value="{{ contactId }}" />

            {% if searchText != '' %}
            <filter type="or">
                <condition attribute="lpi_name"
                           operator="like"
                           value="%{{ searchText }}%" />

                <condition entityname="LT"
                           attribute="lpi_licensename"
                           operator="like"
                           value="%{{ searchText }}%" />
            </filter>
            {% endif %}
        </filter>

        <link-entity name="lpi_functionalflow1"
                     from="lpi_functionalflow1id"
                     to="lpi_functionalflow"
                     alias="FF">
            <link-entity name="lpi_licensetype1"
                         from="lpi_licensetype1id"
                         to="lpi_licensetypeid"
                         alias="LT">
                <attribute name="lpi_boardname" />
                <attribute name="lpi_licensename" />
            </link-entity>
        </link-entity>
    </entity>
</fetch>
{% endfetchxml %}

<div class="container mt-3">

    <div class="card border-0 bg-transparent mb-3">

        <div class="d-flex align-items-center mb-3">
            <div class="flex-grow-1 flex-basis-0" style="width:130px;"></div>

            <div class="text-center flex-grow-1">
                <h4 class="fw-semibold text-dark m-0">My Applications</h4>
            </div>

            <div class="flex-grow-1 flex-basis-0 text-end" style="width:130px;">
                <button id="applyBtn"
                        class="btn text-white border-0 rounded-2 px-3 py-2 shadow-sm"
                        style="background-color: rgb(0, 94, 184); cursor:pointer;">
                    <i class="fa fa-paper-plane me-2"></i>Apply Now
                </button>
            </div>
        </div>

        <form method="get" id="searchForm">
            <input type="text"
                   id="applicationSearch"
                   name="search"
                   class="form-control form-control-sm"
                   placeholder="Search by Application Name or License Name"
                   value="{{ searchText }}" />
        </form>

    </div>

    {% if applications.results.entities.size > 0 %}

        {% for app in applications.results.entities %}

        <div class="card app-card mb-3">
            <div class="card-body">
                <div class="app-row">

                    <div class="app-col-name">
                        {{ app.lpi_name }}
                    </div>

                    <div class="app-col-license">
                        {{ app['LT.lpi_licensename'].label }}
                    </div>

                    <div class="app-col-date">
                        {% if app.statuscode.value != 1 %}
                            <div><strong>Submitted On:</strong></div>
                            {% if app.lpi_submissiondate %}
                                <time id="submittion_date"
                                      datetime="{{ app.lpi_submissiondate | date_to_iso8601 }}">
                                </time>
                            {% endif %}
                        {% else %}
                            <div style="visibility:hidden;"><strong>Submitted On:</strong></div>
                            <div style="visibility:hidden;">&nbsp;</div>
                        {% endif %}
                    </div>

                    <div class="app-col-status">
                        <span class="badge rounded-pill bg-light text-primary border px-3 py-2">
                            {{ app.statuscode.label }}
                        </span>
                    </div>

                    <div class="app-col-actions">

                        {% if app.statuscode.value == 1 %}

                        <button class="btn btn-primary btn-sm action-btn edit-btn"
                                onclick="openApplication('{{ app.lpi_applicationid }}','{{ app.lpi_functionalflow.id }}')">
                            <i class="fa fa-edit me-1"></i>Edit
                        </button>

                        <button class="btn btn-outline-danger btn-sm action-btn"
                                onclick="discardApplication('{{ app.lpi_applicationid }}')">
                            <i class="fa fa-trash me-1"></i>Discard
                        </button>

                        {% else %}

                        <button class="btn btn-primary btn-sm action-btn view-btn"
                                onclick="openApplication('{{ app.lpi_applicationid }}','{{ app.lpi_functionalflow.id }}')">
                            <i class="fa fa-eye me-1"></i>View
                        </button>

                        {% endif %}

                    </div>

                </div>
            </div>
        </div>

        {% endfor %}

    {% else %}

        <div class="text-center text-muted mt-4">
            No applications found matching your search.
        </div>

    {% endif %}

    <div class="d-flex justify-content-between align-items-center mt-4 mb-3">

        <div>
            {% if currentPage > 1 %}
            <a class="btn btn-outline-secondary btn-sm"
               href="?page={{ prevPage }}&search={{ searchText | url_escape }}">
                <i class="fa fa-arrow-left"></i> Previous
            </a>
            {% endif %}
        </div>

        <div>
            <span class="small text-muted">
                Page {{ currentPage }}
            </span>
        </div>

        <div>
            {% if applications.results.more_records %}
            <a class="btn btn-outline-primary btn-sm"
               href="?page={{ nextPage }}&search={{ searchText | url_escape }}">
                Next <i class="fa fa-arrow-right"></i>
            </a>
            {% endif %}
        </div>

    </div>

</div>

<script>
document.addEventListener("DOMContentLoaded", function () {

    const searchInput = document.getElementById("applicationSearch");

    searchInput.addEventListener("keypress", function (e) {

        if (e.key === "Enter") {
            e.preventDefault();
            document.getElementById("searchForm").submit();
        }

    });

});
</script>
